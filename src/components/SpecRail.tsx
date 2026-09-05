'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import type { Calibration, JewelryItem } from '@/lib/types';
import type { EngineDiagnostics } from '@/hooks/useTryOnEngine';

type FitTarget = 'necklace' | 'earring';

interface PieceFit {
  item: JewelryItem | null;
  calibration: Calibration;
  onChange: (patch: Partial<Calibration>) => void;
}

/**
 * The signature panel: a jeweller's spec card. Every value is a real measured
 * quantity, set in monospace numerals against hairline rules, the way a bench
 * ticket lists gauge and drop. A set with both a pendant and earrings gets a
 * tab per piece — each follows a different anchor and keeps its own numbers.
 */
export function SpecRail({
  necklace,
  earring,
  diagnostics,
  onReset,
}: {
  necklace: PieceFit;
  earring: PieceFit;
  diagnostics: EngineDiagnostics;
  onReset: () => void;
}) {
  const available: FitTarget[] = [
    ...(necklace.item ? (['necklace'] as const) : []),
    ...(earring.item ? (['earring'] as const) : []),
  ];
  const [tab, setTab] = useState<FitTarget>(available[0] ?? 'necklace');

  // If the selected set changes shape (e.g. it has no earrings), fall back to
  // whichever piece is actually available rather than showing an empty card.
  useEffect(() => {
    if (!available.includes(tab) && available[0]) setTab(available[0]);
  }, [available, tab]);

  const active = tab === 'earring' && earring.item ? earring : necklace;
  const activeKind: FitTarget = tab === 'earring' && earring.item ? 'earring' : 'necklace';

  const earWidth =
    diagnostics.earL && diagnostics.earR
      ? (diagnostics.earL.width + diagnostics.earR.width) / 2
      : (diagnostics.earL ?? diagnostics.earR)?.width ?? null;

  const spanMm =
    activeKind === 'necklace'
      ? diagnostics.anchor
        ? Math.round(diagnostics.anchor.width * active.calibration.scale * 0.42)
        : null
      : earWidth !== null
        ? Math.round(earWidth * active.calibration.scale)
        : null;

  return (
    <aside className="case-panel flex h-full flex-col">
      <div className="px-5 pt-5">
        <span className="hallmark">Fit card</span>
        {available.length > 1 && (
          <div className="mt-3 flex gap-1 rounded-[2px] border border-white/10 p-1">
            <MiniTab active={activeKind === 'necklace'} onClick={() => setTab('necklace')}>
              Necklace
            </MiniTab>
            <MiniTab active={activeKind === 'earring'} onClick={() => setTab('earring')}>
              Earrings
            </MiniTab>
          </div>
        )}
        <h2 className="mt-2 font-display text-[22px] font-light leading-snug text-bone">
          {active.item?.name ?? 'No piece selected'}
        </h2>
        {active.item?.material && <p className="mt-1 text-[12px] text-ash">{active.item.material}</p>}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-px bg-white/[0.06]">
        <Readout label="Tracking" value={diagnostics.hasFace ? (diagnostics.hasShoulders ? 'Full' : 'Face') : 'None'} />
        <Readout label="Span" value={spanMm ? `${spanMm}` : '—'} unit="mm" />
        <Readout label="Rate" value={diagnostics.fps ? `${diagnostics.fps}` : '—'} unit="fps" />
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <Gauge
          label="Drop"
          hint={activeKind === 'necklace' ? 'How far below the chin it rests' : 'How far below the earlobe it hangs'}
          value={active.calibration.offsetY}
          min={-0.35}
          max={0.5}
          step={0.005}
          format={(v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`}
          onChange={(offsetY) => active.onChange({ offsetY })}
        />
        <Gauge
          label="Sway"
          hint="Left–right nudge off centre"
          value={active.calibration.offsetX}
          min={-0.25}
          max={0.25}
          step={0.005}
          format={(v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`}
          onChange={(offsetX) => active.onChange({ offsetX })}
        />
        {activeKind === 'earring' && (
          <Gauge
            label="Spread"
            hint="Pulls the pair apart, or in toward each other"
            value={active.calibration.spread}
            min={-0.5}
            max={1.5}
            step={0.01}
            format={(v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%`}
            onChange={(spread) => active.onChange({ spread })}
          />
        )}
        <Gauge
          label="Size"
          hint={
            activeKind === 'necklace' ? 'Scales against your measured shoulders' : 'Scales against your measured jaw'
          }
          value={active.calibration.scale}
          min={0.4}
          max={2}
          step={0.01}
          format={(v) => `${(v * 100).toFixed(0)}%`}
          onChange={(scale) => active.onChange({ scale })}
        />
        {activeKind === 'necklace' && (
          <Gauge
            label="Drape"
            hint="Slack in the chain across the chest"
            value={active.calibration.curve}
            min={0}
            max={1}
            step={0.01}
            format={(v) => `${(v * 100).toFixed(0)}%`}
            onChange={(curve) => active.onChange({ curve })}
          />
        )}
        <Gauge
          label="Tilt"
          hint={
            activeKind === 'necklace'
              ? 'Extra rotation on top of your shoulder line'
              : 'Extra rotation on top of your head tilt'
          }
          value={active.calibration.rotation}
          min={-0.35}
          max={0.35}
          step={0.005}
          format={(v) => `${((v * 180) / Math.PI).toFixed(1)}°`}
          onChange={(rotation) => active.onChange({ rotation })}
        />
        <Gauge
          label="Shadow"
          hint="Contact shadow against the skin"
          value={active.calibration.shadow}
          min={0}
          max={1}
          step={0.01}
          format={(v) => `${(v * 100).toFixed(0)}%`}
          onChange={(shadow) => active.onChange({ shadow })}
        />
        <Gauge
          label="Opacity"
          hint="Lower it to soften a heavy cut-out"
          value={active.calibration.opacity}
          min={0.2}
          max={1}
          step={0.01}
          format={(v) => `${(v * 100).toFixed(0)}%`}
          onChange={(opacity) => active.onChange({ opacity })}
        />
      </div>

      <div className="flex gap-2 border-t border-white/[0.06] px-5 py-4">
        <button type="button" onClick={onReset} className="ghost-button flex-1">
          Reset
        </button>
      </div>
    </aside>
  );
}

function MiniTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'flex-1 rounded-[1px] px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors',
        active ? 'bg-champagne/15 text-champagne' : 'text-ash hover:text-bone',
      )}
    >
      {children}
    </button>
  );
}

function Readout({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="bg-velvet-900 px-3 py-3 text-center">
      <div className="hallmark text-[9px]">{label}</div>
      <div className="mt-1 font-mono text-[15px] text-champagne">
        {value}
        {unit && <span className="ml-0.5 text-[9px] text-ash">{unit}</span>}
      </div>
    </div>
  );
}

function Gauge({
  label,
  hint,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const id = `gauge-${label.toLowerCase()}`;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="font-mono text-[11px] uppercase tracking-[0.14em] text-bone">
          {label}
        </label>
        <output htmlFor={id} className="font-mono text-[12px] tabular-nums text-champagne">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={format(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2.5"
      />
      <p className="mt-1.5 text-[11px] leading-snug text-ash/70">{hint}</p>
    </div>
  );
}
