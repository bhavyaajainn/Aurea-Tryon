'use client';

import type { Config } from '@imgly/background-removal';

/**
 * Turning a product photo into a wearable overlay.
 *
 * The segmentation model gets you most of the way, but its raw output is not
 * ready to composite: it leaves a halo of the old background around thin chain
 * links, stray blobs where a prop or a hand was, a display prop welded straight
 * onto the piece with no gap the matte could ever separate, and a huge
 * transparent margin that wrecks the scaling maths downstream. So the model is
 * step one of six.
 *
 *   1. segment      — ISNet alpha matte
 *   2. despeckle    — drop alpha islands too small to be jewellery
 *   3. strip prop   — peel away a smooth display prop (a bust, a stand) fused
 *                     to the piece at the frame's edge, by texture not alpha
 *   4. decontaminate— pull the old background colour out of semi-transparent edges
 *   5. tighten      — sharpen the alpha ramp so chains read crisp, not smeared
 *   6. trim         — crop to the piece and record its true aspect ratio
 */

export interface CutoutOptions {
  /** Alpha below this is treated as fully transparent. 0-255. */
  alphaFloor?: number;
  /** Islands smaller than this share of total pixels are removed. */
  despeckleRatio?: number;
  /** Higher = harder edges. 1 leaves the model's ramp alone. */
  edgeContrast?: number;
  onProgress?: (stage: string, ratio: number) => void;
}

export interface CutoutResult {
  /** Transparent PNG, cropped to the piece. */
  blob: Blob;
  dataUrl: string;
  thumbDataUrl: string;
  width: number;
  height: number;
  /** Share of the cropped box that is actually opaque. Very low = probably a bad cut. */
  coverage: number;
}

const DEFAULTS = {
  alphaFloor: 12,
  despeckleRatio: 0.0006,
  edgeContrast: 1.6,
};

/**
 * How long the model download/inference can go with no progress callback
 * before we give up and surface an error instead of hanging forever. The
 * model itself streams from a third-party CDN (see resources.json in
 * @imgly/background-removal), so a stalled or blocked connection would
 * otherwise leave the upload UI stuck on "Loading the matting model"
 * indefinitely with no way out but a page reload.
 */
const MODEL_STALL_TIMEOUT_MS = 45_000;

/**
 * Races a promise against a rolling inactivity timeout rather than a flat
 * deadline, so genuine (slow but progressing) downloads aren't killed early —
 * only a connection that stops making progress entirely trips it.
 */
function rejectOnStall<T>(promise: Promise<T>, idleMs: () => number, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      if (idleMs() > timeoutMs) {
        clearInterval(interval);
        reject(new Error(message));
      }
    }, 1000);
    promise.then(
      (v) => {
        clearInterval(interval);
        resolve(v);
      },
      (e) => {
        clearInterval(interval);
        reject(e);
      },
    );
  });
}

/** Turns a product photo into one wearable overlay. */
export async function cutOutJewelry(file: File | Blob, opts: CutoutOptions = {}): Promise<CutoutResult[]> {
  const { alphaFloor, despeckleRatio, edgeContrast } = { ...DEFAULTS, ...opts };
  const report = opts.onProgress ?? (() => {});

  report('Loading the matting model', 0.05);

  // Imported at call time rather than at module scope. The library resolves to
  // onnxruntime's Node build when webpack compiles this file for the server,
  // and that build is not parseable by the client compiler. Deferring the
  // import keeps it out of the server graph entirely.
  const { removeBackground } = await import('@imgly/background-removal');

  let lastProgressAt = Date.now();
  const config: Config = {
    // isnet is the accurate one. Swap to 'isnet_quint8' if first-load size matters
    // more than clean edges on thin chains.
    model: 'isnet',
    output: { format: 'image/png', quality: 1 },
    progress: (key, current, total) => {
      lastProgressAt = Date.now();
      if (total > 0) report('Loading the matting model', 0.05 + (current / total) * 0.35);
    },
  };

  report('Separating the piece from its background', 0.45);
  const raw = await rejectOnStall(
    removeBackground(file, config),
    () => Date.now() - lastProgressAt,
    MODEL_STALL_TIMEOUT_MS,
    'The background-removal model is taking too long to load. Check your connection and try again.',
  );

  report('Cleaning the edges', 0.7);
  const bitmap = await createImageBitmap(raw);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is unavailable in this browser.');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  despeckle(img, alphaFloor, despeckleRatio);
  if (stripBorderProp(img, alphaFloor)) despeckle(img, alphaFloor, despeckleRatio);
  decontaminateEdges(img, alphaFloor);
  tightenAlpha(img, alphaFloor, edgeContrast);
  ctx.putImageData(img, 0, 0);

  report('Cropping to the piece', 0.88);
  const cropped = await finalizeCutout(canvas);
  if (!cropped) {
    throw new Error('Nothing left after the cut. Try a photo with the piece on a plain background.');
  }

  report('Done', 1);

  return [cropped];
}

/**
 * Crops a canvas to its opaque content and packages it as a {@link CutoutResult}.
 * Shared by the automatic pipeline above and the manual eraser in the
 * Workshop: after a hand-erased stroke, the piece needs the same re-trim and
 * re-encode, just without running the matting model again.
 */
export async function finalizeCutout(canvas: HTMLCanvasElement): Promise<CutoutResult | null> {
  const trimmed = trimTransparent(canvas);
  if (!trimmed) return null;
  return {
    blob: await canvasToBlob(trimmed.canvas),
    dataUrl: trimmed.canvas.toDataURL('image/png'),
    thumbDataUrl: makeThumb(trimmed.canvas, 320),
    width: trimmed.canvas.width,
    height: trimmed.canvas.height,
    coverage: trimmed.coverage,
  };
}

/**
 * Rotates a finished cut-out by an arbitrary angle and re-trims it — the fix
 * for a piece photographed at a slight tilt, or turned a quarter-turn by a
 * phone's orientation metadata. Draws onto a canvas sized to the rotated
 * bounding box (so corners never clip), then reuses {@link finalizeCutout}
 * for the same re-trim/re-encode the rest of the pipeline goes through.
 */
export async function rotateCutout(cutout: CutoutResult, degrees: number): Promise<CutoutResult | null> {
  if (degrees % 360 === 0) return cutout;

  const img = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Could not read the cut-out to rotate it.'));
  });
  img.src = cutout.dataUrl;
  await loaded;

  const rad = (degrees * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const w = cutout.width;
  const h = cutout.height;
  const outW = Math.ceil(w * cos + h * sin);
  const outH = Math.ceil(w * sin + h * cos);

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.translate(outW / 2, outH / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);

  return finalizeCutout(canvas);
}

/**
 * Flood-fills every opaque region and erases the ones too small to be part of
 * the piece. This is what removes a hand, a price tag, or leftover speckle
 * without touching the chain itself.
 *
 * Connectivity is judged on a gap-bridged copy of the mask, not the raw
 * pixels: a strung bead necklace is a row of separate beads with a sliver of
 * background between each one, so on the raw mask every bead is its own tiny
 * component and none of them individually clears `minSize` — despeckle would
 * keep only the solid pendant and erase the entire strand as "noise". Bridging
 * first merges anything within a small radius into one component for sizing
 * purposes, while real debris (a hand, a price tag) sits far enough away that
 * the bridge never reaches it. The bridge only decides what survives; the
 * pixels erased are always the true (unbridged) opaque ones.
 */
function despeckle(img: ImageData, alphaFloor: number, minRatio: number): void {
  const { width: w, height: h, data } = img;
  const total = w * h;
  const minSize = Math.max(24, Math.floor(total * minRatio));

  const mask = new Uint8Array(total);
  for (let i = 0; i < total; i++) mask[i] = data[i * 4 + 3] > alphaFloor ? 1 : 0;

  const radius = Math.min(40, Math.max(2, Math.round(Math.sqrt(minSize) * 0.4)));
  const bridged = dilateMask(mask, w, h, radius);

  const label = new Int32Array(total).fill(-1);
  const stack = new Int32Array(total);
  const mass: number[] = [];

  for (let i = 0; i < total; i++) {
    if (bridged[i] !== 1 || label[i] !== -1) continue;

    const id = mass.length;
    let sp = 0;
    stack[sp++] = i;
    label[i] = id;
    let m = mask[i];

    while (sp > 0) {
      const p = stack[--sp];
      const x = p % w;
      const y = (p / w) | 0;

      // 8-connected: chain links touch diagonally more often than not.
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (bridged[n] !== 1 || label[n] !== -1) continue;
          label[n] = id;
          stack[sp++] = n;
          m += mask[n];
        }
      }
    }
    mass.push(m);
  }

  if (mass.length === 0) return;

  // Keep the largest region, plus anything else big enough to be a real element
  // (a detachable pendant, a second strand in a layered piece).
  let largest = 0;
  for (let id = 1; id < mass.length; id++) if (mass[id] > mass[largest]) largest = id;

  for (let i = 0; i < total; i++) {
    if (mask[i] !== 1) continue;
    const id = label[i];
    if (id === largest || mass[id] >= minSize) continue;
    data[i * 4 + 3] = 0;
  }
}

/**
 * Binary dilation (any 1 within `radius`) via two separable prefix-sum
 * passes, so it stays O(w·h) regardless of radius instead of an O(w·h·r²)
 * window scan.
 */
function dilateMask(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  if (radius <= 0) return mask;

  const rowDilated = new Uint8Array(w * h);
  const prefix = new Int32Array(w + 1);
  for (let y = 0; y < h; y++) {
    const base = y * w;
    for (let x = 0; x < w; x++) prefix[x + 1] = prefix[x] + mask[base + x];
    for (let x = 0; x < w; x++) {
      const lo = Math.max(0, x - radius);
      const hi = Math.min(w, x + radius + 1);
      rowDilated[base + x] = prefix[hi] - prefix[lo] > 0 ? 1 : 0;
    }
  }

  const out = new Uint8Array(w * h);
  const colCount = new Int32Array(w);
  for (let ry = 0; ry <= Math.min(radius, h - 1); ry++) {
    const base = ry * w;
    for (let x = 0; x < w; x++) colCount[x] += rowDilated[base + x];
  }
  for (let y = 0; y < h; y++) {
    const base = y * w;
    for (let x = 0; x < w; x++) out[base + x] = colCount[x] > 0 ? 1 : 0;

    const addRow = y + radius + 1;
    const removeRow = y - radius;
    if (addRow < h) {
      const addBase = addRow * w;
      for (let x = 0; x < w; x++) colCount[x] += rowDilated[addBase + x];
    }
    if (removeRow >= 0) {
      const removeBase = removeRow * w;
      for (let x = 0; x < w; x++) colCount[x] -= rowDilated[removeBase + x];
    }
  }
  return out;
}

/**
 * Peels away a display prop (a bust, a stand, a mannequin neck) that the
 * segmentation model kept as foreground because it's welded directly onto the
 * piece with no background gap between them — despeckle can't touch this,
 * since it's one continuous opaque blob with the jewellery, not a separate
 * small or disconnected one.
 *
 * The distinguishing trait a prop has that jewellery doesn't: it's smooth.
 * Metal edges, gem facets, and bead outlines all produce sharp local
 * luminance swings; a fabric or wood neck form is comparatively flat. And a
 * welded prop is reliably reachable from the *frame's edge* — the photo is
 * cropped tight around it — while the piece itself normally sits with a
 * margin around it. So: flood-fill inward from the canvas border through
 * only opaque, low-texture pixels, and stop the instant real jewellery
 * detail is hit. The texture threshold is the low quartile of this photo's
 * own opaque pixels, so it adapts to lighting instead of a fixed guess.
 *
 * Returns whether anything was erased, so the caller knows whether a mop-up
 * despeckle pass (to clear fragments — a watermark's letters — now stranded
 * by the removal) is worth running again.
 */
function stripBorderProp(img: ImageData, alphaFloor: number): boolean {
  const { width: w, height: h, data } = img;
  const total = w * h;

  const opaque = new Uint8Array(total);
  const lum = new Uint8ClampedArray(total);
  for (let i = 0; i < total; i++) {
    if (data[i * 4 + 3] <= alphaFloor) continue;
    opaque[i] = 1;
    lum[i] = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
  }

  const texture = new Uint8ClampedArray(total);
  const hist = new Uint32Array(256);
  let opaqueCount = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!opaque[i]) continue;
      let lo = 255;
      let hi = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (!opaque[n]) continue;
          const v = lum[n];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
      const t = hi - lo;
      texture[i] = t;
      hist[t]++;
      opaqueCount++;
    }
  }
  if (opaqueCount === 0) return false;

  // The low quartile of this piece's own texture — smooth prop material
  // clusters far below what any real jewellery surface produces.
  const target = opaqueCount * 0.25;
  let threshold = 255;
  let cum = 0;
  for (let v = 0; v < 256; v++) {
    cum += hist[v];
    if (cum >= target) {
      threshold = v;
      break;
    }
  }

  const visited = new Uint8Array(total);
  const stack = new Int32Array(total);
  let sp = 0;
  const seed = (x: number, y: number) => {
    const i = y * w + x;
    if (opaque[i] && texture[i] <= threshold && !visited[i]) {
      visited[i] = 1;
      stack[sp++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x, 0);
    seed(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    seed(0, y);
    seed(w - 1, y);
  }

  const erased: number[] = [];
  while (sp > 0) {
    const p = stack[--sp];
    erased.push(p);
    const x = p % w;
    const y = (p / w) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (visited[n] || !opaque[n] || texture[n] > threshold) continue;
        visited[n] = 1;
        stack[sp++] = n;
      }
    }
  }

  // A legitimate photo where the subject itself is mostly smooth (a plain
  // polished band) — or one framed with no margin at all — shouldn't be
  // gutted on a guess. Back off entirely rather than erase most of the piece.
  if (erased.length === 0 || erased.length > opaqueCount * 0.4) return false;

  for (const p of erased) data[p * 4 + 3] = 0;
  return true;
}

/**
 * Semi-transparent edge pixels still carry the old background's colour, which
 * shows up as a pale rim once the piece is over skin. Re-weight each edge pixel
 * toward the colour of its nearest solid neighbours.
 */
function decontaminateEdges(img: ImageData, alphaFloor: number): void {
  const { width: w, height: h, data } = img;
  const copy = new Uint8ClampedArray(data);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = copy[i + 3];
      if (a <= alphaFloor || a >= 250) continue;

      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = (ny * w + nx) * 4;
          if (copy[j + 3] < 250) continue;
          r += copy[j];
          g += copy[j + 1];
          b += copy[j + 2];
          n++;
        }
      }
      if (n === 0) continue;

      // Blend toward the solid core, weighted by how transparent this pixel is.
      const t = 1 - a / 255;
      data[i] = copy[i] * (1 - t) + (r / n) * t;
      data[i + 1] = copy[i + 1] * (1 - t) + (g / n) * t;
      data[i + 2] = copy[i + 2] * (1 - t) + (b / n) * t;
    }
  }
}

/** Steepens the alpha ramp around its midpoint so fine chains stay legible. */
function tightenAlpha(img: ImageData, alphaFloor: number, contrast: number): void {
  const { data } = img;
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i];
    if (a === 0) continue;
    if (a <= alphaFloor) {
      data[i] = 0;
      continue;
    }
    const norm = a / 255;
    const shaped = 1 / (1 + Math.exp(-(norm - 0.5) * 6 * contrast));
    data[i] = Math.round(Math.min(1, shaped) * 255);
  }
}

/**
 * Crops away transparent margin and reports how solid the result is. Tests
 * against 0, not alphaFloor: `tightenAlpha` already zeroed everything below
 * the floor before this runs, and reshaped what's left through a contrast
 * curve, so re-applying the same floor here would catch pixels the curve
 * pushed low without them ever being background — clipping real edges of
 * the piece (thin chain, faint stone facets) out of the crop.
 */
function trimTransparent(canvas: HTMLCanvasElement): { canvas: HTMLCanvasElement; coverage: number } | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const { width: w, height: h } = canvas;
  const { data } = ctx.getImageData(0, 0, w, h);

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  let opaque = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] === 0) continue;
      opaque++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) return null;

  const pad = Math.ceil(Math.max(maxX - minX, maxY - minY) * 0.01);
  const x0 = Math.max(0, minX - pad);
  const y0 = Math.max(0, minY - pad);
  const cw = Math.min(w, maxX + pad + 1) - x0;
  const ch = Math.min(h, maxY + pad + 1) - y0;

  const out = document.createElement('canvas');
  out.width = cw;
  out.height = ch;
  out.getContext('2d')!.drawImage(canvas, x0, y0, cw, ch, 0, 0, cw, ch);

  return { canvas: out, coverage: opaque / (cw * ch) };
}

function makeThumb(source: HTMLCanvasElement, maxEdge: number): string {
  const scale = Math.min(1, maxEdge / Math.max(source.width, source.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(source.width * scale));
  c.height = Math.max(1, Math.round(source.height * scale));
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the cut-out.'))), 'image/png');
  });
}
