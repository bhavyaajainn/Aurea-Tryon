'use client';

import type { Calibration, EarAnchor, NeckAnchor } from './types';

/**
 * Draws a flat cut-out PNG so it reads as a chain lying on a chest.
 *
 * Two things sell it. First, a parabolic sag: the middle of the chain hangs
 * lower than the ends. Second, a soft contact shadow offset down and behind.
 * Both are computed into an offscreen buffer and cached, because re-slicing an
 * image 48 times per frame is wasteful when the shape rarely changes.
 */

const SLICES = 48;
/** Sag depth at curve = 1, as a fraction of necklace width. */
const MAX_SAG = 0.16;

interface WarpKey {
  src: string;
  width: number;
  curve: number;
  yawScale: number;
}

export class NecklaceRenderer {
  private buffer: HTMLCanvasElement | null = null;
  private key: WarpKey | null = null;

  /**
   * Composites the necklace onto ctx. The caller has already drawn the video
   * frame; we only add the piece.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    srcId: string,
    anchor: NeckAnchor,
    cal: Calibration,
  ): void {
    if (!image.complete || image.naturalWidth === 0) return;

    const width = Math.max(8, anchor.width * cal.scale);
    const buf = this.warp(image, srcId, width, cal.curve, anchor.yawScale);
    if (!buf) return;

    const alpha = cal.opacity * Math.max(0.15, anchor.confidence);

    ctx.save();
    ctx.translate(anchor.x + cal.offsetX * width, anchor.y + cal.offsetY * width);
    ctx.rotate(anchor.roll + cal.rotation);
    ctx.globalAlpha = alpha;

    // Contact shadow first, as a blurred copy sitting just under the metal.
    if (cal.shadow > 0.01) {
      ctx.save();
      ctx.globalAlpha = alpha * cal.shadow * 0.55;
      ctx.filter = `blur(${Math.max(2, width * 0.012)}px) brightness(0)`;
      ctx.drawImage(buf, -buf.width / 2, width * 0.012, buf.width, buf.height);
      ctx.restore();
    }

    ctx.drawImage(buf, -buf.width / 2, 0, buf.width, buf.height);
    ctx.restore();
  }

  /** Slices the source horizontally and offsets each slice along a parabola. */
  private warp(
    image: HTMLImageElement,
    srcId: string,
    width: number,
    curve: number,
    yawScale: number,
  ): HTMLCanvasElement | null {
    // Quantise so tiny frame-to-frame wobble does not bust the cache.
    const qWidth = Math.round(width / 4) * 4;
    const qYaw = Math.round(yawScale * 40) / 40;
    const qCurve = Math.round(curve * 40) / 40;

    if (
      this.buffer &&
      this.key &&
      this.key.src === srcId &&
      this.key.width === qWidth &&
      this.key.curve === qCurve &&
      this.key.yawScale === qYaw
    ) {
      return this.buffer;
    }

    const drawW = Math.max(8, qWidth * qYaw);
    const drawH = (drawW / image.naturalWidth) * image.naturalHeight;
    const sag = qCurve * MAX_SAG * qWidth;

    const canvas = this.buffer ?? document.createElement('canvas');
    canvas.width = Math.ceil(drawW);
    canvas.height = Math.ceil(drawH + sag) + 2;

    const c = canvas.getContext('2d');
    if (!c) return null;
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.imageSmoothingQuality = 'high';

    if (sag < 0.5) {
      c.drawImage(image, 0, 0, drawW, drawH);
    } else {
      const sliceSrcW = image.naturalWidth / SLICES;
      const sliceDstW = drawW / SLICES;
      for (let i = 0; i < SLICES; i++) {
        const t = ((i + 0.5) / SLICES) * 2 - 1; // -1 at the clasp, 0 at the centre
        const dy = (1 - t * t) * sag;
        c.drawImage(
          image,
          i * sliceSrcW,
          0,
          sliceSrcW + 0.75, // overlap avoids hairline seams between slices
          image.naturalHeight,
          i * sliceDstW,
          dy,
          sliceDstW + 0.75,
          drawH,
        );
      }
    }

    this.buffer = canvas;
    this.key = { src: srcId, width: qWidth, curve: qCurve, yawScale: qYaw };
    return canvas;
  }

  invalidate(): void {
    this.key = null;
  }
}

/**
 * Draws a single earring at an earlobe. Unlike a necklace it never sags, so
 * there is no per-shape warp buffer to cache — a plain scaled draw is cheap
 * enough to redo every frame.
 *
 * The same cut-out is worn on both ears. Photographed pieces usually read as
 * a matched pair only when one side is mirrored, so the caller flips one ear.
 */
export class EarringRenderer {
  draw(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    anchor: EarAnchor,
    cal: Calibration,
    mirror: boolean,
  ): void {
    if (!image.complete || image.naturalWidth === 0) return;

    const width = Math.max(6, anchor.width * cal.scale * anchor.yawScale);
    const height = (width / image.naturalWidth) * image.naturalHeight;
    const alpha = cal.opacity * Math.max(0.15, anchor.confidence);

    ctx.save();
    ctx.translate(anchor.x + cal.offsetX * width, anchor.y + cal.offsetY * width);
    ctx.rotate(anchor.roll + cal.rotation);
    if (mirror) ctx.scale(-1, 1);
    ctx.globalAlpha = alpha;

    // A native canvas shadow comes from this same draw call, so it always
    // reads as one blurred halo — unlike an offset duplicate sprite, which at
    // earring scale reads as a second earring rather than a shadow.
    if (cal.shadow > 0.01) {
      ctx.shadowColor = `rgba(0, 0, 0, ${Math.min(1, cal.shadow)})`;
      ctx.shadowBlur = Math.max(3, width * 0.1);
      ctx.shadowOffsetY = width * 0.05;
    }

    ctx.drawImage(image, -width / 2, 0, width, height);
    ctx.restore();
  }
}

/** Draws the video frame itself, cover-fitted and optionally mirrored. */
export function drawSource(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sw: number,
  sh: number,
  mirror: boolean,
): void {
  const { width: dw, height: dh } = ctx.canvas;
  ctx.save();
  if (mirror) {
    ctx.translate(dw, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, 0, 0, sw, sh, 0, 0, dw, dh);
  ctx.restore();
}
