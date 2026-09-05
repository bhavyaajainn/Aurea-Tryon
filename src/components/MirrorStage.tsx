'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { ArrowLeft, Maximize2, Minimize2 } from 'lucide-react';
import { useTryOnEngine } from '@/hooks/useTryOnEngine';
import { useTryOn } from '@/lib/store';
import { SpecRail } from './SpecRail';

/**
 * The mirror itself. Everything visible is painted into one canvas — video
 * frame, then necklace, then earrings, then optional guides — so a capture is
 * exactly what the viewer saw, with no compositing surprises.
 */
export function MirrorStage({ onBack }: { onBack: () => void }) {
  const necklaceCalibration = useTryOn((s) => s.necklaceCalibration);
  const earringCalibration = useTryOn((s) => s.earringCalibration);
  const mirror = useTryOn((s) => s.mirror);
  const quality = useTryOn((s) => s.quality);
  const mode = useTryOn((s) => s.mode);
  const photoUrl = useTryOn((s) => s.photoUrl);
  const showGuides = useTryOn((s) => s.showGuides);
  const necklace = useTryOn((s) => s.necklace);
  const earring = useTryOn((s) => s.earring);

  const patchNecklaceCalibration = useTryOn((s) => s.patchNecklaceCalibration);
  const patchEarringCalibration = useTryOn((s) => s.patchEarringCalibration);
  const resetCalibration = useTryOn((s) => s.resetCalibration);
  const setMirror = useTryOn((s) => s.setMirror);
  const setMode = useTryOn((s) => s.setMode);
  const setPhotoUrl = useTryOn((s) => s.setPhotoUrl);
  const toggleGuides = useTryOn((s) => s.toggleGuides);

  const [notice, setNotice] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const stageWrapRef = useRef<HTMLDivElement | null>(null);

  // The CSS overlay below is what actually guarantees the fullscreen look —
  // iOS Safari only supports the native Fullscreen API on a bare <video>
  // element, not on an arbitrary container, so requesting it here is a
  // best-effort bonus (it hides the browser chrome on desktop) rather than
  // something the feature depends on.
  useEffect(() => {
    const onNativeChange = () => {
      if (!document.fullscreenElement) setIsFullscreen(false);
    };
    document.addEventListener('fullscreenchange', onNativeChange);
    return () => document.removeEventListener('fullscreenchange', onNativeChange);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  function toggleFullscreen() {
    setIsFullscreen((prev) => {
      const next = !prev;
      if (next) {
        void stageWrapRef.current?.requestFullscreen?.().catch(() => {});
      } else if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
      }
      return next;
    });
  }

  // Preloaded overlay bitmaps, keyed by piece id (a pair's right-ear image
  // gets a suffixed key). Decoding on selection would drop the first few
  // frames of every switch. Each fresh upload gets a fresh id, so a changed
  // photo always decodes a new bitmap rather than reusing a stale one.
  const overlays = useRef(new Map<string, HTMLImageElement>());
  useEffect(() => {
    const preload = (key: string, url: string) => {
      if (overlays.current.has(key)) return;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = url;
      overlays.current.set(key, img);
    };
    if (necklace) preload(necklace.id, necklace.imageUrl);
    if (earring) {
      preload(earring.id, earring.imageUrl);
      if (earring.pairImageUrl) preload(pairKey(earring.id), earring.pairImageUrl);
    }
  }, [necklace, earring]);

  const necklaceCalRef = useRef(necklaceCalibration);
  necklaceCalRef.current = necklaceCalibration;
  const earringCalRef = useRef(earringCalibration);
  earringCalRef.current = earringCalibration;
  const necklaceIdRef = useRef<string | null>(necklace?.id ?? null);
  necklaceIdRef.current = necklace?.id ?? null;
  const earringIdRef = useRef<string | null>(earring?.id ?? null);
  earringIdRef.current = earring?.id ?? null;
  const earringPairIdRef = useRef<string | null>(earring?.pairImageUrl ? earring.id : null);
  earringPairIdRef.current = earring?.pairImageUrl ? earring.id : null;

  const engine = useTryOnEngine({
    quality,
    mirror,
    showGuides,
    mode,
    getOverlay: () => {
      const nId = necklaceIdRef.current;
      const eId = earringIdRef.current;
      const pairId = earringPairIdRef.current;
      return {
        necklace: nId
          ? { image: overlays.current.get(nId) ?? null, srcId: nId, calibration: necklaceCalRef.current }
          : null,
        earring: eId
          ? {
              image: overlays.current.get(eId) ?? null,
              pairImage: pairId ? overlays.current.get(pairKey(pairId)) ?? null : null,
              srcId: eId,
              calibration: earringCalRef.current,
            }
          : null,
      };
    },
  });

  // In photo mode the canvas is static, so any change has to trigger a repaint.
  // renderPhoto is held in a ref rather than listed as a dependency: the hook
  // returns a fresh object every render, and depending on it would make this
  // effect re-run on the very state updates renderPhoto itself causes.
  const renderPhotoRef = useRef(engine.renderPhoto);
  renderPhotoRef.current = engine.renderPhoto;

  useEffect(() => {
    if (mode !== 'photo' || !photoUrl) return;
    const t = setTimeout(() => void renderPhotoRef.current(), 40);
    return () => clearTimeout(t);
  }, [mode, photoUrl, necklaceCalibration, earringCalibration, necklace, earring, showGuides]);

  const busy = engine.status === 'loading-models' || engine.status === 'starting-camera';

  function handlePhoto(file: File | undefined) {
    if (!file) return;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    // Leaving Live mode for a static photo shouldn't leave the camera hardware
    // (and its on-device indicator) running in the background.
    engine.stopCamera();
    setPhotoUrl(URL.createObjectURL(file));
    setMode('photo');
  }

  function handleCapture() {
    const url = engine.capture();
    if (!url) {
      setNotice('There is nothing on the mirror to save yet.');
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aurea-try-on.png';
    a.click();
  }

  const statusLine = useMemo(() => {
    if (engine.status === 'loading-models') return 'Loading the tracking models';
    if (engine.status === 'starting-camera') return 'Waking the camera';
    if (engine.status === 'error') return engine.error ?? 'Something went wrong';
    if (engine.status === 'running' && !engine.diagnostics.hasFace) return 'Looking for a face';
    return null;
  }, [engine.status, engine.error, engine.diagnostics.hasFace]);

  const necklaceFit = { item: necklace, calibration: necklaceCalibration, onChange: patchNecklaceCalibration };
  const earringFit = { item: earring, calibration: earringCalibration, onChange: patchEarringCalibration };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div
        ref={stageWrapRef}
        className={clsx(
          // min-w-0 opts this grid item out of the browser's automatic
          // content-based minimum width — without it, the stage panel's
          // aspect-ratio + min-height below gets transferred into a min-width
          // (min-height × 4∶3) that can exceed a narrow viewport and blow out
          // the grid track.
          'min-w-0 space-y-4',
          isFullscreen && 'fixed inset-0 z-50 flex flex-col justify-center bg-velvet-950 p-4',
        )}
      >
        <div
          className={clsx(
            'case-panel relative w-full overflow-hidden',
            // A floor on the short side: below ~420px wide, a plain 4:3 box gets
            // too short for the centered "Start the mirror" copy to clear the
            // fullscreen toggle pinned in the corner.
            isFullscreen ? 'min-h-0 flex-1' : 'aspect-[4/3] min-h-[320px]',
          )}
        >
          <video ref={engine.videoRef} playsInline muted className="hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {photoUrl && (
            <img
              ref={engine.photoRef}
              src={photoUrl}
              alt=""
              className="hidden"
              onLoad={() => void engine.renderPhoto()}
            />
          )}

          <canvas ref={engine.canvasRef} className="h-full w-full bg-velvet-950 object-contain" />

          {engine.status !== 'running' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-velvet-950/85 px-6 text-center backdrop-blur-sm">
              <div>
                <p className="font-display text-[26px] font-light leading-snug text-bone">
                  {engine.status === 'error' ? 'The mirror stalled' : 'Step in front of the mirror'}
                </p>
                <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-ash">
                  {engine.status === 'error'
                    ? engine.error
                    : 'Your camera stream stays in this browser tab. Nothing is uploaded.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                <button type="button" onClick={() => void engine.start()} disabled={busy} className="gilt-button">
                  {busy ? statusLine : 'Start the mirror'}
                </button>
                <button type="button" onClick={() => fileRef.current?.click()} className="ghost-button">
                  Use a photo
                </button>
              </div>
            </div>
          )}

          {engine.status === 'running' && statusLine && (
            <p
              role="status"
              className="absolute left-4 top-4 rounded-[2px] border border-white/10 bg-velvet-950/75 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ash backdrop-blur"
            >
              {statusLine}
            </p>
          )}

          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Minimise the mirror' : 'Maximise the mirror'}
            aria-pressed={isFullscreen}
            className="absolute right-4 top-4 rounded-[2px] border border-white/10 bg-velvet-950/75 p-2 text-ash backdrop-blur transition-colors hover:border-white/25 hover:text-bone"
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => handlePhoto(e.target.files?.[0])}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onBack} className="ghost-button" aria-label="Back to upload">
              <ArrowLeft size={13} />
              Back
            </button>
            <span className="mx-1 hidden h-4 w-px bg-white/10 sm:block" />
            <Toggle active={mode === 'camera'} onClick={() => { setMode('camera'); void engine.start(); }}>
              Live
            </Toggle>
            <Toggle active={mode === 'photo'} onClick={() => fileRef.current?.click()}>
              Photo
            </Toggle>
            <Toggle active={mirror} onClick={() => setMirror(!mirror)}>
              Flip
            </Toggle>
            <Toggle active={showGuides} onClick={toggleGuides}>
              Guide
            </Toggle>
          </div>
          <button type="button" onClick={handleCapture} className="gilt-button w-full sm:ml-auto sm:w-auto">
            Save picture
          </button>
        </div>

        {notice && (
          <p role="status" className="animate-riseIn text-[12px] text-champagne">
            {notice}
          </p>
        )}
      </div>

      <SpecRail necklace={necklaceFit} earring={earringFit} diagnostics={engine.diagnostics} onReset={resetCalibration} />
    </div>
  );
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'rounded-[2px] border px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors',
        active
          ? 'border-champagne/50 bg-champagne/10 text-champagne'
          : 'border-white/10 text-ash hover:border-white/25 hover:text-bone',
      )}
    >
      {children}
    </button>
  );
}

/** Overlay-map key for an earring's right-ear image, kept distinct from its left-ear id. */
function pairKey(itemId: string): string {
  return `${itemId}__pair`;
}
