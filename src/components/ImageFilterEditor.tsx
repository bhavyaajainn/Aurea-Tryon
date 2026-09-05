'use client';

import { useMemo, useState } from 'react';
import { finalizeCutout, type CutoutResult } from '@/lib/cutout';
import { useModalDialog } from '@/hooks/useModalDialog';

interface FilterValues {
  brightness: number;
  contrast: number;
  saturation: number;
}

const DEFAULT_FILTERS: FilterValues = { brightness: 100, contrast: 100, saturation: 100 };

/**
 * A colour pass over one cut-out — brightness, contrast, saturation — before
 * it ever meets the mirror. Preview is a live CSS `filter` on the image
 * itself (free, no canvas work per drag tick); "Apply" bakes the same filter
 * string into the pixels via canvas and re-packages the result through
 * `finalizeCutout` so the rest of the app sees an ordinary `CutoutResult`.
 * Colour filters leave the alpha channel alone, so there's nothing to re-trim.
 */
export function ImageFilterEditor({
  cutout,
  onApply,
  onCancel,
}: {
  cutout: CutoutResult;
  onApply: (next: CutoutResult) => void;
  onCancel: () => void;
}) {
  const dialogRef = useModalDialog<HTMLDivElement>(onCancel);
  const [filters, setFilters] = useState<FilterValues>(DEFAULT_FILTERS);
  const [busy, setBusy] = useState(false);

  const cssFilter = useMemo(
    () => `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturation}%)`,
    [filters],
  );
  const isDefault =
    filters.brightness === DEFAULT_FILTERS.brightness &&
    filters.contrast === DEFAULT_FILTERS.contrast &&
    filters.saturation === DEFAULT_FILTERS.saturation;

  async function apply() {
    if (isDefault) {
      onCancel();
      return;
    }
    setBusy(true);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Could not read the cut-out to filter it.'));
        img.src = cutout.dataUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = cutout.width;
      canvas.height = cutout.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.filter = cssFilter;
      ctx.drawImage(img, 0, 0);

      const next = await finalizeCutout(canvas);
      if (next) onApply(next);
      else onCancel();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="filters-title"
        tabIndex={-1}
        className="case-panel flex w-full max-w-3xl flex-col gap-4 p-5 outline-none"
      >
        <div className="flex items-center justify-between">
          <span id="filters-title" className="hallmark">Adjust filters</span>
          <button
            type="button"
            onClick={onCancel}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-ash transition-colors hover:text-bone"
          >
            Close
          </button>
        </div>

        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_220px]">
          <div
            className="relative flex min-h-[260px] items-center justify-center overflow-hidden bg-velvet-900"
            style={{
              backgroundImage:
                'linear-gradient(45deg, #6b6b6b 25%, transparent 25%), linear-gradient(-45deg, #6b6b6b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #6b6b6b 75%), linear-gradient(-45deg, transparent 75%, #6b6b6b 75%)',
              backgroundSize: '16px 16px',
              backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cutout.dataUrl}
              alt=""
              className="max-h-[50vh] max-w-full object-contain"
              style={{ filter: cssFilter }}
            />
          </div>

          <div className="space-y-4">
            <FilterGauge
              label="Brightness"
              value={filters.brightness}
              min={50}
              max={150}
              onChange={(brightness) => setFilters((f) => ({ ...f, brightness }))}
            />
            <FilterGauge
              label="Contrast"
              value={filters.contrast}
              min={50}
              max={150}
              onChange={(contrast) => setFilters((f) => ({ ...f, contrast }))}
            />
            <FilterGauge
              label="Saturation"
              value={filters.saturation}
              min={0}
              max={200}
              onChange={(saturation) => setFilters((f) => ({ ...f, saturation }))}
            />
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_FILTERS)}
              disabled={isDefault}
              className="ghost-button w-full disabled:opacity-30"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="flex justify-end border-t border-white/[0.06] pt-4">
          <button type="button" onClick={() => void apply()} disabled={busy} className="gilt-button px-6">
            {busy ? 'Applying' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterGauge({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const id = `filter-${label.toLowerCase()}`;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="font-mono text-[11px] uppercase tracking-[0.14em] text-bone">
          {label}
        </label>
        <output htmlFor={id} className="font-mono text-[12px] tabular-nums text-champagne">
          {value}%
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-valuetext={`${value}%`}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2.5"
      />
    </div>
  );
}
