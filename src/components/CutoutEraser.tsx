'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { finalizeCutout, type CutoutResult } from '@/lib/cutout';
import { useModalDialog } from '@/hooks/useModalDialog';

/**
 * A brush-and-erase pass over one cut-out, for whatever the automatic pipeline
 * left behind — a stray prop, a watermark, a shadow. Paints alpha to zero on a
 * copy of the cut-out's own canvas; "Apply" re-trims and re-encodes it the
 * same way the pipeline does (via `finalizeCutout`), so the result is a
 * normal `CutoutResult` the caller doesn't need to treat specially.
 */
export function CutoutEraser({
  cutout,
  onApply,
  onCancel,
}: {
  cutout: CutoutResult;
  onApply: (next: CutoutResult) => void;
  onCancel: () => void;
}) {
  const dialogRef = useModalDialog<HTMLDivElement>(onCancel);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const historyRef = useRef<ImageData[]>([]);
  const drawingRef = useRef(false);
  const [brush, setBrush] = useState(() => Math.max(6, Math.round(Math.min(cutout.width, cutout.height) * 0.06)));
  const [canUndo, setCanUndo] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const loadOriginal = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      historyRef.current = [];
      setCanUndo(false);
      setReady(true);
    };
    img.src = cutout.dataUrl;
  }, [cutout]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = cutout.width;
    canvas.height = cutout.height;
    loadOriginal();
  }, [cutout, loadOriginal]);

  function eraseAt(x: number, y: number) {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, brush / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (historyRef.current.length > 20) historyRef.current.shift();
    setCanUndo(true);
    drawingRef.current = true;
    const { x, y } = pointFromEvent(e);
    eraseAt(x, y);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const { x, y } = pointFromEvent(e);
    eraseAt(x, y);
  }

  function handlePointerUp() {
    drawingRef.current = false;
  }

  function undo() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const last = historyRef.current.pop();
    if (!canvas || !ctx || !last) return;
    ctx.putImageData(last, 0, 0);
    setCanUndo(historyRef.current.length > 0);
  }

  async function apply() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy(true);
    setWarning(null);
    try {
      const next = await finalizeCutout(canvas);
      if (!next) {
        // Erasing away every opaque pixel leaves nothing to re-crop. Stay
        // open rather than closing as if the edit had landed — a silent
        // close here would look like "Apply" quietly did nothing.
        setWarning('That erased the whole piece — nothing is left to keep. Undo a stroke or reset, then try Apply again.');
        return;
      }
      onApply(next);
    } finally {
      setBusy(false);
    }
  }

  const brushMin = Math.max(3, Math.round(Math.min(cutout.width, cutout.height) * 0.01));
  const brushMax = Math.max(brushMin + 1, Math.round(Math.min(cutout.width, cutout.height) * 0.3));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="eraser-title"
        tabIndex={-1}
        className="case-panel flex w-full max-w-2xl flex-col gap-4 p-5 outline-none"
      >
        <div className="flex items-center justify-between">
          <span id="eraser-title" className="hallmark">Smart eraser</span>
          <button
            type="button"
            onClick={onCancel}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-ash transition-colors hover:text-bone"
          >
            Close
          </button>
        </div>
        <p className="text-[12px] leading-relaxed text-ash">
          Drag over anything that shouldn&apos;t be there — a stray prop, a watermark, a leftover shadow. Painted
          areas become transparent; applying re-crops to what&apos;s left.
        </p>

        <div
          className="relative mx-auto flex max-h-[55vh] items-center justify-center overflow-hidden bg-velvet-900"
          style={{
            backgroundImage:
              'linear-gradient(45deg, #6b6b6b 25%, transparent 25%), linear-gradient(-45deg, #6b6b6b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #6b6b6b 75%), linear-gradient(-45deg, transparent 75%, #6b6b6b 75%)',
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
          }}
        >
          <canvas
            ref={canvasRef}
            className="max-h-[55vh] max-w-full object-contain"
            style={{ touchAction: 'none', cursor: 'crosshair' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
          {!ready && <p className="absolute text-[12px] text-ash">Loading…</p>}
        </div>

        {warning && <p role="alert" className="text-[11px] leading-relaxed text-garnet">{warning}</p>}

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ash">
            Brush
            <input
              type="range"
              min={brushMin}
              max={brushMax}
              value={brush}
              aria-valuetext={`${brush} pixels`}
              onChange={(e) => setBrush(Number(e.target.value))}
            />
          </label>
          <button type="button" onClick={() => { undo(); setWarning(null); }} disabled={!canUndo} className="ghost-button disabled:opacity-40">
            Undo
          </button>
          <button type="button" onClick={() => { loadOriginal(); setWarning(null); }} className="ghost-button">
            Reset
          </button>
          <button type="button" onClick={() => void apply()} disabled={busy} className="gilt-button ml-auto">
            {busy ? 'Applying' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}
