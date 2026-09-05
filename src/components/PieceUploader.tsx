'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Eraser, RotateCcw, RotateCw, SlidersHorizontal, UploadCloud } from 'lucide-react';
import { cutOutJewelry, rotateCutout, type CutoutResult } from '@/lib/cutout';
import { NECKLACE_LENGTH_LABELS, type NecklaceLength } from '@/lib/types';
import { CutoutEraser } from './CutoutEraser';
import { ImageFilterEditor } from './ImageFilterEditor';

const NECKLACE_LENGTHS: NecklaceLength[] = ['choker', 'standard', 'long'];

type Stage = 'idle' | 'processing' | 'ready' | 'error';

/**
 * One of the three upload boxes on the landing flow — a necklace, a left
 * earring, or a right earring, each cut out and straightened independently.
 * The matting model (`cutOutJewelry`) is background-agnostic — it segments
 * the piece by shape, not by chroma-keying a colour, so a plain white
 * seamless, a black velvet pad, or a busy tabletop all work the same way.
 */
export function PieceUploader({
  label,
  hint,
  badge,
  cutout,
  onChange,
  lengthPicker,
}: {
  label: string;
  hint: string;
  /** Small tag next to the label — e.g. "Start here" or "Optional". */
  badge?: string;
  cutout: CutoutResult | null;
  onChange: (cutout: CutoutResult | null) => void;
  /** Necklace-only: lets the wearer confirm or correct the auto-detected length. */
  lengthPicker?: { value: NecklaceLength; onChange: (value: NecklaceLength) => void };
}) {
  const [stage, setStage] = useState<Stage>(cutout ? 'ready' : 'idle');
  const [progress, setProgress] = useState<{ label: string; ratio: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [previewAngle, setPreviewAngle] = useState(0);
  const [erasing, setErasing] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [justUpdated, setJustUpdated] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const updatedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (updatedTimer.current) clearTimeout(updatedTimer.current);
  }, []);

  /** Brief confirmation flash after a rotate, erase, or filter apply actually lands. */
  function flashUpdated() {
    setJustUpdated(true);
    if (updatedTimer.current) clearTimeout(updatedTimer.current);
    updatedTimer.current = setTimeout(() => setJustUpdated(false), 1600);
  }

  async function ingest(file: File) {
    setError(null);
    setStage('processing');
    setPreviewAngle(0);
    try {
      const [result] = await cutOutJewelry(file, {
        onProgress: (l, ratio) => setProgress({ label: l, ratio }),
      });
      if (result.coverage < 0.03) {
        setError('The cut came back almost empty. A photo of the piece alone, on a plain surface, works best.');
      }
      onChange(result);
      setStage('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The background could not be removed.');
      setStage('error');
    } finally {
      setProgress(null);
    }
  }

  async function commitRotation(degrees: number) {
    if (!cutout || degrees === 0) return;
    setRotating(true);
    try {
      const next = await rotateCutout(cutout, degrees);
      if (next) {
        onChange(next);
        flashUpdated();
      }
      setPreviewAngle(0);
    } finally {
      setRotating(false);
    }
  }

  function remove() {
    onChange(null);
    setStage('idle');
    setError(null);
    setPreviewAngle(0);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) void ingest(file);
      }}
      className={clsx(
        'case-panel relative flex flex-col overflow-hidden transition-colors',
        dragging && 'border-champagne/50 bg-champagne/[0.05]',
      )}
    >
      <div className="flex items-start justify-between gap-2 px-4 pt-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-display text-[16px] font-light leading-snug text-bone">{label}</p>
            {badge && (
              <span className="rounded-[2px] border border-champagne/30 bg-champagne/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-champagne">
                {badge}
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-ash">{hint}</p>
        </div>
        {stage === 'ready' && (
          <button
            type="button"
            onClick={remove}
            className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-ash transition-colors hover:text-bone"
          >
            Remove
          </button>
        )}
      </div>

      <div
        className="relative mt-3 flex min-h-[180px] flex-1 items-center justify-center bg-velvet-900 p-5"
        style={
          stage === 'ready'
            ? {
                backgroundImage:
                  'linear-gradient(45deg, #6b6b6b 25%, transparent 25%), linear-gradient(-45deg, #6b6b6b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #6b6b6b 75%), linear-gradient(-45deg, transparent 75%, #6b6b6b 75%)',
                backgroundSize: '16px 16px',
                backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
                backgroundColor: 'rgba(107,107,107,0.16)',
              }
            : undefined
        }
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void ingest(f);
          }}
        />

        {stage === 'idle' && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center gap-2.5 text-center"
          >
            <UploadCloud size={22} className="text-champagne/70" aria-hidden="true" />
            <span className="gilt-button">Choose a photo</span>
            <span className="max-w-[200px] text-[11px] leading-relaxed text-ash">
              or drop one here — any background, light or dark
            </span>
          </button>
        )}

        {stage === 'processing' && progress && (
          <div className="w-full max-w-[200px] text-center" role="status" aria-live="polite">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-champagne">{progress.label}</p>
            <div
              className="mt-3 h-px w-full overflow-hidden bg-white/10"
              role="progressbar"
              aria-label={progress.label}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress.ratio * 100)}
            >
              <div
                className="h-full bg-champagne transition-[width] duration-300"
                style={{ width: `${Math.round(progress.ratio * 100)}%` }}
              />
            </div>
          </div>
        )}

        {stage === 'ready' && cutout && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cutout.dataUrl}
              alt={`Your uploaded ${label.toLowerCase()} cutout`}
              className={clsx('max-h-[180px] max-w-full object-contain', rotating && 'opacity-50')}
              style={{ transform: `rotate(${previewAngle}deg)`, transition: previewAngle === 0 ? 'transform 150ms' : undefined }}
            />
            {justUpdated && (
              <span
                role="status"
                className="absolute right-2 top-2 animate-riseIn rounded-[2px] border border-champagne/40 bg-velvet-950/85 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-champagne"
              >
                Updated
              </span>
            )}
          </>
        )}

        {stage === 'error' && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center gap-2 text-center"
          >
            <span className="gilt-button">Try another photo</span>
          </button>
        )}
      </div>

      {error && <p role="alert" className="px-4 pt-3 text-[11px] leading-relaxed text-garnet">{error}</p>}

      {stage === 'ready' && (
        <div className="space-y-2.5 border-t border-white/[0.06] px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void commitRotation(-90)}
              disabled={rotating}
              aria-label="Rotate left 90 degrees"
              className="ghost-button px-2.5 py-1.5"
            >
              <RotateCcw size={13} />
            </button>
            <button
              type="button"
              onClick={() => void commitRotation(90)}
              disabled={rotating}
              aria-label="Rotate right 90 degrees"
              className="ghost-button px-2.5 py-1.5"
            >
              <RotateCw size={13} />
            </button>
            <input
              type="range"
              min={-45}
              max={45}
              step={1}
              value={previewAngle}
              disabled={rotating}
              onChange={(e) => setPreviewAngle(Number(e.target.value))}
              className="mx-1 flex-1"
              aria-label="Straighten"
              aria-valuetext={`${previewAngle}°`}
            />
            <button
              type="button"
              onClick={() => void commitRotation(previewAngle)}
              disabled={rotating || previewAngle === 0}
              className="font-mono text-[10px] uppercase tracking-[0.14em] text-ash transition-colors hover:text-bone disabled:opacity-30"
            >
              Straighten
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setErasing(true)} className="ghost-button flex-1 gap-1.5">
              <Eraser size={13} />
              Smart eraser
            </button>
            <button type="button" onClick={() => setFiltering(true)} className="ghost-button flex-1 gap-1.5">
              <SlidersHorizontal size={13} />
              Adjust filters
            </button>
          </div>
          <p className="text-right font-mono text-[10px] uppercase tracking-[0.14em] text-ash/70">
            {cutout?.width}×{cutout?.height}
          </p>
          {lengthPicker && (
            <div className="border-t border-white/[0.06] pt-2.5">
              <p className="text-[11px] leading-relaxed text-ash">
                How it&apos;s worn — we guessed, tap to correct:
              </p>
              <div className="mt-2 flex gap-1 rounded-[2px] border border-white/10 p-1">
                {NECKLACE_LENGTHS.map((length) => (
                  <button
                    key={length}
                    type="button"
                    onClick={() => lengthPicker.onChange(length)}
                    aria-pressed={lengthPicker.value === length}
                    className={clsx(
                      'flex-1 rounded-[1px] px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors',
                      lengthPicker.value === length
                        ? 'bg-champagne/15 text-champagne'
                        : 'text-ash hover:text-bone',
                    )}
                  >
                    {NECKLACE_LENGTH_LABELS[length]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {erasing &&
        cutout &&
        createPortal(
          <CutoutEraser
            cutout={cutout}
            onApply={(next) => {
              onChange(next);
              setErasing(false);
              flashUpdated();
            }}
            onCancel={() => setErasing(false)}
          />,
          document.body,
        )}

      {filtering &&
        cutout &&
        createPortal(
          <ImageFilterEditor
            cutout={cutout}
            onApply={(next) => {
              onChange(next);
              setFiltering(false);
              flashUpdated();
            }}
            onCancel={() => setFiltering(false)}
          />,
          document.body,
        )}
    </div>
  );
}
