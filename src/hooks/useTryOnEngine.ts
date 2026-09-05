'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { NeckTracker, type TrackerQuality } from '@/lib/tracker';
import { NecklaceRenderer, EarringRenderer, drawSource } from '@/lib/renderer';
import type { Calibration, EarAnchor, NeckAnchor, TrackerFrame } from '@/lib/types';
import type { StageMode } from '@/lib/store';

export type EngineStatus = 'idle' | 'loading-models' | 'starting-camera' | 'running' | 'error';

/**
 * Longest edge of the photo-mode canvas. A phone photo can be 4000px wide,
 * which is 64 MB of canvas for no visible benefit.
 */
const MAX_PHOTO_EDGE = 1600;

export interface EngineDiagnostics {
  fps: number;
  hasFace: boolean;
  hasShoulders: boolean;
  anchor: NeckAnchor | null;
  earL: EarAnchor | null;
  earR: EarAnchor | null;
}

type OverlayPiece = { image: HTMLImageElement | null; srcId: string; calibration: Calibration } | null;
type EarringOverlay =
  | { image: HTMLImageElement | null; pairImage: HTMLImageElement | null; srcId: string; calibration: Calibration }
  | null;

interface Options {
  quality: TrackerQuality;
  mirror: boolean;
  showGuides: boolean;
  /** Whether the stage is currently showing the camera or a static photo. */
  mode: StageMode;
  /** Live values, read fresh every frame so slider drags feel instant. */
  getOverlay: () => { necklace: OverlayPiece; earring: EarringOverlay };
}

/**
 * Owns the camera stream, the render loop, and the lifetime of the two models.
 *
 * The loop is intentionally single-threaded on the main thread. Moving
 * inference to a worker is the right next step for low-end phones, but it needs
 * OffscreenCanvas plumbing that would obscure the parts worth reading here.
 */
export function useTryOnEngine(opts: Options) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const photoRef = useRef<HTMLImageElement | null>(null);

  const trackerRef = useRef<NeckTracker | null>(null);
  const rendererRef = useRef<NecklaceRenderer>(new NecklaceRenderer());
  const earringRendererRef = useRef<EarringRenderer>(new EarringRenderer());
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  /**
   * Guards against a second start() landing while one is already loading
   * models / opening the camera (a fast double-click, or the "Live" toggle
   * firing on a click that didn't actually change mode) — without it, two
   * NeckTracker instances and two rAF loops end up racing on the same video
   * element and hitting the WASM graphs concurrently.
   */
  const activeRef = useRef(false);

  const [status, setStatus] = useState<EngineStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<EngineDiagnostics>({
    fps: 0,
    hasFace: false,
    hasShoulders: false,
    anchor: null,
    earL: null,
    earR: null,
  });

  const stop = useCallback(() => {
    activeRef.current = false;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    trackerRef.current?.close();
    trackerRef.current = null;
    setStatus('idle');
  }, []);

  /**
   * Releases just the camera hardware (and lets a subsequent start() fully
   * re-acquire it), without tearing down the tracker. Switching to Photo mode
   * only stops the render loop from painting the video frame — the getUserMedia
   * stream itself, and the camera's on-device indicator, would otherwise stay
   * live for as long as the mirror stage is mounted.
   */
  const stopCamera = useCallback(() => {
    activeRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || activeRef.current) return;
    activeRef.current = true;

    setError(null);
    try {
      setStatus('loading-models');
      const tracker = new NeckTracker(optsRef.current.quality);
      await tracker.load();
      trackerRef.current = tracker;

      setStatus('starting-camera');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();

      setStatus('running');
      loop();
    } catch (e) {
      setStatus('error');
      setError(describeStartupFailure(e));
      stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop]);

  /**
   * Caches the last photo actually run through the tracker, keyed by its
   * (already-scaled) src. A calibration or guide-toggle change re-invokes
   * renderPhoto to repaint, but the photo itself hasn't changed — re-running
   * face/pose detection on every slider tick would redo the expensive part
   * (a MediaPipe IMAGE-mode switch, twice) for a result that can't have
   * changed since the last frame.
   */
  const lastPhotoDetectionRef = useRef<{
    src: string;
    scaled: Pick<TrackerFrame, 'anchor' | 'earL' | 'earR'>;
    hasFace: boolean;
    hasShoulders: boolean;
  } | null>(null);

  /** Runs the still-photo path once, then paints the result. */
  const renderPhoto = useCallback(async () => {
    const image = photoRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas || !image.complete) return;

    let tracker = trackerRef.current;
    if (!tracker) {
      setStatus('loading-models');
      tracker = new NeckTracker(optsRef.current.quality);
      try {
        await tracker.load();
      } catch (e) {
        setStatus('error');
        setError(describeStartupFailure(e));
        return;
      }
      trackerRef.current = tracker;
    }

    const nw = image.naturalWidth;
    const nh = image.naturalHeight;
    const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(nw, nh));
    canvas.width = Math.round(nw * scale);
    canvas.height = Math.round(nh * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cached = lastPhotoDetectionRef.current;
    let scaled: Pick<TrackerFrame, 'anchor' | 'earL' | 'earR'>;
    let hasFace: boolean;
    let hasShoulders: boolean;
    if (cached && cached.src === image.src) {
      ({ scaled, hasFace, hasShoulders } = cached);
    } else {
      const frame = await tracker.detectImage(image);
      // Landmarks came back in the photo's own pixel space, so every anchor
      // has to shrink with the canvas or the pieces land off the body.
      scaled = scaleFrame(frame, scale);
      hasFace = frame.hasFace;
      hasShoulders = frame.hasShoulders;
      lastPhotoDetectionRef.current = { src: image.src, scaled, hasFace, hasShoulders };
    }

    paint(ctx, image, nw, nh, scaled, false);
    setDiagnostics({ fps: 0, hasFace, hasShoulders, anchor: scaled.anchor, earL: scaled.earL, earR: scaled.earR });
    setStatus('running');
  }, []);

  /** Shared compositing step for both the live and photo paths. */
  function paint(
    ctx: CanvasRenderingContext2D,
    source: CanvasImageSource,
    sw: number,
    sh: number,
    frame: Pick<TrackerFrame, 'anchor' | 'earL' | 'earR'>,
    mirror: boolean,
  ) {
    const { showGuides, getOverlay } = optsRef.current;
    drawSource(ctx, source, sw, sh, mirror);

    // Landmarks are measured on the unmirrored frame, so flip every anchor to
    // match what the viewer is actually looking at.
    const flip = <T extends { x: number; roll: number }>(a: T): T =>
      mirror ? { ...a, x: ctx.canvas.width - a.x, roll: -a.roll } : a;

    const neck = frame.anchor ? flip(frame.anchor) : null;
    const earL = frame.earL ? flip(frame.earL) : null;
    const earR = frame.earR ? flip(frame.earR) : null;

    const overlay = getOverlay();
    if (neck && overlay.necklace?.image) {
      rendererRef.current.draw(ctx, overlay.necklace.image, overlay.necklace.srcId, neck, overlay.necklace.calibration);
    }
    if (overlay.earring?.image) {
      const { image, pairImage, calibration } = overlay.earring;
      const spread = applyEarSpread(earL, earR, calibration.spread);
      if (pairImage) {
        // A true photographed pair: each side is used as shot, no mirroring.
        if (spread.left) earringRendererRef.current.draw(ctx, image, spread.left, calibration, false);
        if (spread.right) earringRendererRef.current.draw(ctx, pairImage, spread.right, calibration, false);
      } else {
        // A single piece: mirror one side to read as a matching pair.
        if (spread.left) earringRendererRef.current.draw(ctx, image, spread.left, calibration, true);
        if (spread.right) earringRendererRef.current.draw(ctx, image, spread.right, calibration, false);
      }
    }

    if (showGuides) {
      if (neck) drawGuides(ctx, neck);
      if (earL) drawEarGuide(ctx, earL);
      if (earR) drawEarGuide(ctx, earR);
    }
  }

  function loop() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const tracker = trackerRef.current;
    if (!video || !canvas || !tracker) return;

    let frames = 0;
    let fpsClock = performance.now();

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      // Photo mode drives the same tracker and canvas through detectImage(),
      // so the live loop has to stand down or the two race on the shared
      // FaceLandmarker instance (it throws when detectForVideo lands mid
      // switch to IMAGE mode) and fight over what's painted on the canvas.
      if (optsRef.current.mode !== 'camera') return;
      if (video.readyState < 2 || video.videoWidth === 0) return;

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        rendererRef.current.invalidate();
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const now = performance.now();
      let frame;
      try {
        frame = tracker.detectVideo(video, now);
        paint(ctx, video, video.videoWidth, video.videoHeight, frame, optsRef.current.mirror);
      } catch {
        // A single bad frame (e.g. a device switch mid-inference) shouldn't
        // crash the loop — just skip painting and try again next tick.
        return;
      }

      frames++;
      if (now - fpsClock >= 500) {
        const fps = Math.round((frames * 1000) / (now - fpsClock));
        frames = 0;
        fpsClock = now;
        setDiagnostics({
          fps,
          hasFace: frame.hasFace,
          hasShoulders: frame.hasShoulders,
          anchor: frame.anchor,
          earL: frame.earL,
          earR: frame.earR,
        });
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }

  /** Flattens the current canvas to a downloadable PNG. */
  const capture = useCallback((): string | null => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0) return null;
    return canvas.toDataURL('image/png');
  }, []);

  useEffect(() => stop, [stop]);

  return { videoRef, canvasRef, photoRef, status, error, diagnostics, start, stop, stopCamera, renderPhoto, capture };
}

/** Scales every anchor in a frame by the same factor — used when a photo is downsized to fit the canvas. */
function scaleFrame(frame: TrackerFrame, scale: number): Pick<TrackerFrame, 'anchor' | 'earL' | 'earR'> {
  const scaleOne = <T extends { x: number; y: number; width: number }>(a: T | null): T | null =>
    a ? { ...a, x: a.x * scale, y: a.y * scale, width: a.width * scale } : null;
  return {
    anchor: scaleOne(frame.anchor),
    earL: scaleOne(frame.earL),
    earR: scaleOne(frame.earR),
  };
}

/**
 * Pushes each ear anchor away from the other by `spread` × its own width (or
 * pulls them together, for a negative value). Purely comparative — whichever
 * anchor currently sits at the smaller screen x moves further negative, the
 * other further positive — so it gives the same visual result whether or not
 * the view is mirrored, without needing to know which is anatomically left.
 */
function applyEarSpread(
  earL: EarAnchor | null,
  earR: EarAnchor | null,
  spread: number,
): { left: EarAnchor | null; right: EarAnchor | null } {
  if (!earL || !earR || spread === 0) return { left: earL, right: earR };
  const leftIsLeftmost = earL.x <= earR.x;
  return {
    left: { ...earL, x: earL.x + spread * earL.width * (leftIsLeftmost ? -1 : 1) },
    right: { ...earR, x: earR.x + spread * earR.width * (leftIsLeftmost ? 1 : -1) },
  };
}

/** Small cross showing where the engine thinks one earlobe is. */
function drawEarGuide(ctx: CanvasRenderingContext2D, a: EarAnchor) {
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(a.roll);
  ctx.strokeStyle = 'rgba(226, 198, 139, 0.85)';
  ctx.lineWidth = Math.max(1, ctx.canvas.width * 0.0018);

  const r = a.width * 0.5;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

/** Thin cross-hair showing where the engine thinks the collarbone hollow is. */
function drawGuides(ctx: CanvasRenderingContext2D, a: NeckAnchor) {
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(a.roll);
  ctx.strokeStyle = 'rgba(226, 198, 139, 0.85)';
  ctx.lineWidth = Math.max(1, ctx.canvas.width * 0.0018);

  ctx.beginPath();
  ctx.moveTo(-a.width / 2, 0);
  ctx.lineTo(a.width / 2, 0);
  ctx.stroke();

  const tick = a.width * 0.05;
  [-a.width / 2, 0, a.width / 2].forEach((x) => {
    ctx.beginPath();
    ctx.moveTo(x, -tick);
    ctx.lineTo(x, tick);
    ctx.stroke();
  });

  ctx.restore();
}

function describeStartupFailure(e: unknown): string {
  if (e instanceof DOMException) {
    if (e.name === 'NotAllowedError') return 'Camera access was blocked. Allow it in your browser settings, then start the mirror again.';
    if (e.name === 'NotFoundError') return 'No camera found. Connect one, or switch to the photo tab and upload a picture.';
    if (e.name === 'NotReadableError') return 'Another app is holding the camera. Close it and try again.';
  }
  if (e instanceof Error && /fetch|network|load/i.test(e.message)) {
    return 'The tracking models could not be downloaded. Check the connection and try again.';
  }
  return e instanceof Error ? e.message : 'The mirror could not start.';
}
