'use client';

import clsx from 'clsx';
import type { JewelryItem, JewelrySet } from '@/lib/types';

/**
 * The looks, laid out the way a shop assistant lays them on a velvet pad —
 * side by side, all facing you, nothing in a box. Each card is a set: a
 * pendant, a pair of earrings, or both worn together.
 */
export function JewelryTray({
  sets,
  items,
  selectedId,
  onSelect,
  onRemove,
}: {
  sets: JewelrySet[];
  items: JewelryItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove?: (id: string) => void;
}) {
  if (sets.length === 0) {
    return (
      <div className="case-panel flex items-center justify-between gap-4 px-5 py-6">
        <p className="text-[13px] text-ash">
          The tray is empty. Build a set in the workshop and it appears here.
        </p>
      </div>
    );
  }

  const find = (id: string | null) => (id ? items.find((i) => i.id === id) : undefined);

  return (
    <div className="case-panel p-3">
      <div className="mb-3 flex items-center justify-between px-2">
        <span className="hallmark">Tray · {sets.length} looks</span>
        <span className="hallmark hidden sm:inline">Tap to wear</span>
      </div>

      <ul className="flex snap-x gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
        {sets.map((set) => {
          const necklace = find(set.necklaceId);
          const earring = find(set.earringId);
          const active = set.id === selectedId;
          const label = necklace && earring ? 'Necklace + earrings' : earring ? 'Earrings' : 'Necklace';

          return (
            <li key={set.id} className="relative shrink-0 snap-start">
              <button
                type="button"
                onClick={() => onSelect(set.id)}
                aria-pressed={active}
                className={clsx(
                  'group flex w-[148px] flex-col rounded-[2px] border p-3 text-left transition-all',
                  active
                    ? 'border-champagne/60 bg-champagne/[0.07]'
                    : 'border-white/[0.07] hover:border-white/20 hover:bg-white/[0.03]',
                )}
              >
                <div className="mb-3 flex h-[74px] items-center justify-center gap-1.5 overflow-hidden rounded-[1px] bg-velvet-800/60">
                  {necklace && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={necklace.thumbUrl}
                      alt=""
                      className="max-h-full max-w-[70%] object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.55)]"
                    />
                  )}
                  {earring && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={earring.thumbUrl}
                      alt=""
                      className="max-h-full max-w-[45%] object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.55)]"
                    />
                  )}
                </div>
                <span className="truncate font-display text-[15px] leading-tight text-bone">{set.name}</span>
                <span className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.14em] text-ash">
                  {label}
                </span>
              </button>

              {onRemove && !set.id.startsWith('seed-set') && (
                <button
                  type="button"
                  onClick={() => onRemove(set.id)}
                  aria-label={`Remove ${set.name}`}
                  className="absolute right-1.5 top-1.5 rounded-[1px] border border-white/10 bg-velvet-950/80 px-1.5 py-0.5 font-mono text-[10px] text-ash opacity-0 transition-opacity hover:text-bone focus-visible:opacity-100 group-hover:opacity-100"
                >
                  ✕
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
