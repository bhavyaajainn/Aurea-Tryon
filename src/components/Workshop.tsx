'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { cutOutJewelry, finalizeCutout, type CutoutResult } from '@/lib/cutout';
import { EARRING_STYLES, NECKLACE_STYLES, type JewelryItem, type JewelrySet, type PieceKind } from '@/lib/types';

/**
 * Where a product photo becomes a wearable asset, and where individual pieces
 * are bundled into a set — a pendant, a pair of earrings, or both.
 *
 * The cut happens in the browser. That is a deliberate trade: the first run
 * downloads about 40 MB of model weights, but after that every upload is free,
 * private, and instant, and the server never needs a GPU.
 */
export function Workshop({ initialItems, initialSets }: { initialItems: JewelryItem[]; initialSets: JewelrySet[] }) {
  const [items, setItems] = useState(initialItems);
  const [sets, setSets] = useState(initialSets);
  const [source, setSource] = useState<{ url: string; name: string } | null>(null);
  const [cutouts, setCutouts] = useState<CutoutResult[] | null>(null);
  const [stage, setStage] = useState<{ label: string; ratio: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [erasingIndex, setErasingIndex] = useState<number | null>(null);

  const [kind, setKind] = useState<PieceKind>('necklace');
  const [name, setName] = useState('');
  const [style, setStyle] = useState<string>('pendant');
  const [material, setMaterial] = useState('');
  const [token, setToken] = useState('');

  const [groupName, setGroupName] = useState('');
  const [setNecklaceId, setSetNecklaceId] = useState('');
  const [setEarringId, setSetEarringId] = useState('');
  const [savingSet, setSavingSet] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);

  const styles = kind === 'earring' ? EARRING_STYLES : NECKLACE_STYLES;
  const necklaces = useMemo(() => items.filter((i) => i.kind === 'necklace'), [items]);
  const earrings = useMemo(() => items.filter((i) => i.kind === 'earring'), [items]);

  function changeKind(next: PieceKind) {
    setKind(next);
    setStyle(next === 'earring' ? EARRING_STYLES[0] : NECKLACE_STYLES[0]);
  }

  const ingest = useCallback(
    async (file: File) => {
      setError(null);
      setCutouts(null);
      setErasingIndex(null);
      setSource({ url: URL.createObjectURL(file), name: file.name });
      setName((n) => n || prettifyFilename(file.name));

      try {
        const results = await cutOutJewelry(file, {
          // Only earrings get split — a necklace photo should never be cut in two.
          allowPair: kind === 'earring',
          onProgress: (label, ratio) => setStage({ label, ratio }),
        });
        setCutouts(results);
        if (results[0].coverage < 0.03) {
          setError(
            'The cut came back almost empty. A photo of the piece alone, on a plain surface, gives the model a much easier job.',
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The background could not be removed.');
      } finally {
        setStage(null);
      }
    },
    [kind],
  );

  /** Flips which cut-out goes to which ear, for a detected pair that landed backwards. */
  function swapPair() {
    setCutouts((prev) => (prev && prev.length === 2 ? [prev[1], prev[0]] : prev));
  }

  async function save() {
    if (!cutouts || cutouts.length === 0) return;
    const [left, right] = cutouts;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/jewelry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          kind,
          name,
          style,
          material,
          pngDataUrl: left.dataUrl,
          thumbDataUrl: left.thumbDataUrl,
          width: left.width,
          height: left.height,
          ...(right
            ? {
                pairPngDataUrl: right.dataUrl,
                pairThumbDataUrl: right.thumbDataUrl,
                pairWidth: right.width,
                pairHeight: right.height,
              }
            : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'The piece could not be saved.');

      setItems((prev) => [...prev, data.item as JewelryItem]);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The piece could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/jewelry/${id}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== id));
      // A deleted piece drops out of any set that referenced it, on the server too.
      setSets((prev) =>
        prev
          .map((s) => ({
            ...s,
            necklaceId: s.necklaceId === id ? null : s.necklaceId,
            earringId: s.earringId === id ? null : s.earringId,
          }))
          .filter((s) => s.necklaceId || s.earringId),
      );
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(data.error ?? 'The piece could not be removed.');
  }

  /** Flips a piece between necklace and earring — the fix for a piece saved under the wrong kind. */
  async function retag(item: JewelryItem) {
    const nextKind: PieceKind = item.kind === 'earring' ? 'necklace' : 'earring';
    const res = await fetch(`/api/jewelry/${item.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ kind: nextKind }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? 'The piece could not be recategorised.');
      return;
    }
    setItems((prev) => prev.map((i) => (i.id === item.id ? (data.item as JewelryItem) : i)));
  }

  async function saveSet() {
    if (!setNecklaceId && !setEarringId) {
      setGroupError('Pick a pendant, a pair of earrings, or both.');
      return;
    }
    setSavingSet(true);
    setGroupError(null);
    try {
      const res = await fetch('/api/sets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: groupName,
          necklaceId: setNecklaceId || null,
          earringId: setEarringId || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'The set could not be saved.');

      setSets((prev) => [...prev, data.set as JewelrySet]);
      setGroupName('');
      setSetNecklaceId('');
      setSetEarringId('');
    } catch (e) {
      setGroupError(e instanceof Error ? e.message : 'The set could not be saved.');
    } finally {
      setSavingSet(false);
    }
  }

  async function removeSet(id: string) {
    const res = await fetch(`/api/sets/${id}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      setSets((prev) => prev.filter((s) => s.id !== id));
      return;
    }
    const data = await res.json().catch(() => ({}));
    setGroupError(data.error ?? 'The set could not be removed.');
  }

  function reset() {
    if (source) URL.revokeObjectURL(source.url);
    setSource(null);
    setCutouts(null);
    setErasingIndex(null);
    setName('');
    setMaterial('');
    setStage(null);
  }

  const findItem = (id: string) => items.find((i) => i.id === id);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
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
            'case-panel relative overflow-hidden transition-colors',
            dragging && 'border-champagne/50 bg-champagne/[0.05]',
          )}
        >
          <div className="grid gap-px bg-white/[0.06] sm:grid-cols-2">
            <Pane label="As uploaded" tone="plain">
              {source ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={source.url} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <p className="max-w-[220px] text-center text-[13px] leading-relaxed text-ash">
                  {kind === 'earring'
                    ? 'Drop a photo here — a single earring (mirrored for the other ear), or both earrings of the pair together.'
                    : 'Drop a photo here, or choose one below. One piece per image works best.'}
                </p>
              )}
            </Pane>

            <Pane label="Cut out" tone="checker">
              {cutouts ? (
                <div className="flex items-center justify-center gap-3">
                  {cutouts.map((c, i) => (
                    <div key={i} className="flex flex-col items-center gap-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={c.dataUrl}
                        alt="The piece with its background removed"
                        className="max-h-[220px] max-w-[160px] animate-riseIn object-contain"
                      />
                      {cutouts.length === 2 && (
                        <span className="hallmark text-[9px]">{i === 0 ? 'Left ear' : 'Right ear'}</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setErasingIndex(i)}
                        className="font-mono text-[9px] uppercase tracking-[0.14em] text-ash transition-colors hover:text-champagne"
                      >
                        Erase
                      </button>
                    </div>
                  ))}
                </div>
              ) : stage ? (
                <div className="w-full max-w-[220px] text-center">
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-champagne">{stage.label}</p>
                  <div className="mt-3 h-px w-full overflow-hidden bg-white/10">
                    <div
                      className="h-full bg-champagne transition-[width] duration-300"
                      style={{ width: `${Math.round(stage.ratio * 100)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-[13px] text-ash">The result appears here.</p>
              )}
            </Pane>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] px-4 py-3">
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
            <button type="button" onClick={() => fileRef.current?.click()} className="gilt-button">
              Choose a photo
            </button>
            {source && (
              <button type="button" onClick={reset} className="ghost-button">
                Clear
              </button>
            )}
            {cutouts && cutouts.length === 2 && (
              <span className="ml-auto flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ash">
                Pair detected
                <button type="button" onClick={swapPair} className="text-champagne hover:underline">
                  Swap sides
                </button>
              </span>
            )}
            {cutouts && cutouts.length === 1 && (
              <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.14em] text-ash">
                {cutouts[0].width}×{cutouts[0].height} · {(cutouts[0].coverage * 100).toFixed(0)}% solid
              </span>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" className="case-panel border-oxblood/40 px-4 py-3 text-[13px] leading-relaxed text-bone">
            {error}
          </p>
        )}

        <section className="case-panel p-4">
          <span className="hallmark">In the catalog · {items.length}</span>
          <ul className="mt-3 divide-y divide-white/[0.06]">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-2.5">
                <div className="flex h-9 w-14 shrink-0 items-center justify-center gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.thumbUrl} alt="" className="h-9 max-w-[60%] object-contain" />
                  {item.pairThumbUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.pairThumbUrl} alt="" className="h-9 max-w-[40%] object-contain" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-bone">{item.name}</p>
                  <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-ash">
                    {item.kind === 'earring' ? (item.pairThumbUrl ? 'Earring pair' : 'Earring') : 'Necklace'} ·{' '}
                    {item.style}
                    {item.material ? ` · ${item.material}` : ''}
                  </p>
                </div>
                {item.id.startsWith('seed-') ? (
                  <span className="hallmark shrink-0">Sample</span>
                ) : (
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void retag(item)}
                      className="font-mono text-[10px] uppercase tracking-[0.14em] text-ash transition-colors hover:text-bone"
                    >
                      {item.kind === 'earring' ? 'Mark as necklace' : 'Mark as earring'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(item.id)}
                      className="font-mono text-[10px] uppercase tracking-[0.14em] text-ash transition-colors hover:text-bone"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="case-panel p-4">
          <span className="hallmark">Sets · {sets.length}</span>
          <p className="mt-2 text-[12px] leading-relaxed text-ash">
            A set is what shows up in the mirror's tray. Pair a pendant with earrings, or ship either one alone.
          </p>

          <ul className="mt-3 divide-y divide-white/[0.06]">
            {sets.map((s) => {
              const necklace = s.necklaceId ? findItem(s.necklaceId) : undefined;
              const earring = s.earringId ? findItem(s.earringId) : undefined;
              return (
                <li key={s.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex h-9 w-14 shrink-0 items-center justify-center gap-1 bg-velvet-900">
                    {necklace && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={necklace.thumbUrl} alt="" className="max-h-full max-w-[65%] object-contain" />
                    )}
                    {earring && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={earring.thumbUrl} alt="" className="max-h-full max-w-[40%] object-contain" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-bone">{s.name}</p>
                    <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-ash">
                      {necklace && earring ? 'Necklace + earrings' : earring ? 'Earrings only' : 'Necklace only'}
                    </p>
                  </div>
                  {s.id.startsWith('seed-set') ? (
                    <span className="hallmark shrink-0">Sample</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void removeSet(s.id)}
                      className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-ash transition-colors hover:text-bone"
                    >
                      Remove
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {groupError && <p role="alert" className="mt-3 text-[12px] leading-relaxed text-oxblood">{groupError}</p>}

          <div className="mt-4 space-y-3 border-t border-white/[0.06] pt-4">
            <Field label="Set name">
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Teardrop & pearl studs"
                className="field"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Necklace">
                <select value={setNecklaceId} onChange={(e) => setSetNecklaceId(e.target.value)} className="field">
                  <option value="" className="bg-velvet-900">None</option>
                  {necklaces.map((n) => (
                    <option key={n.id} value={n.id} className="bg-velvet-900">
                      {n.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Earrings">
                <select value={setEarringId} onChange={(e) => setSetEarringId(e.target.value)} className="field">
                  <option value="" className="bg-velvet-900">None</option>
                  {earrings.map((n) => (
                    <option key={n.id} value={n.id} className="bg-velvet-900">
                      {n.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <button
              type="button"
              onClick={() => void saveSet()}
              disabled={savingSet || (!setNecklaceId && !setEarringId)}
              className="gilt-button w-full"
            >
              {savingSet ? 'Building' : 'Build the set'}
            </button>
          </div>
        </section>
      </div>

      <aside className="case-panel flex h-fit flex-col gap-4 p-5">
        <div>
          <span className="hallmark">Piece details</span>
          <p className="mt-2 text-[12px] leading-relaxed text-ash">
            These show on the tray card. Fit adjustments come later, on the mirror.
          </p>
        </div>

        <Field label="Kind">
          <div className="flex gap-1 rounded-[2px] border border-white/10 p-1">
            <KindTab active={kind === 'necklace'} onClick={() => changeKind('necklace')}>
              Necklace / pendant
            </KindTab>
            <KindTab active={kind === 'earring'} onClick={() => changeKind('earring')}>
              Earring
            </KindTab>
          </div>
        </Field>

        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === 'earring' ? 'Pearl stud' : 'Teardrop pendant'}
            className="field"
          />
        </Field>

        <Field label="Style">
          <select value={style} onChange={(e) => setStyle(e.target.value)} className="field">
            {styles.map((s) => (
              <option key={s} value={s} className="bg-velvet-900">
                {s}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Material">
          <input
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            placeholder="18k gold vermeil"
            className="field"
          />
        </Field>

        <Field label="Admin token" hint="Only needed if ADMIN_TOKEN is set on the server.">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="field"
            autoComplete="off"
          />
        </Field>

        <button
          type="button"
          onClick={() => void save()}
          disabled={!cutouts || cutouts.length === 0 || saving}
          className="gilt-button mt-1"
        >
          {saving ? 'Adding' : 'Add to the catalog'}
        </button>
      </aside>

      {erasingIndex !== null && cutouts?.[erasingIndex] && (
        <CutoutEraser
          key={erasingIndex}
          cutout={cutouts[erasingIndex]}
          onApply={(next) => {
            setCutouts((prev) => (prev ? prev.map((c, i) => (i === erasingIndex ? next : c)) : prev));
            setErasingIndex(null);
          }}
          onCancel={() => setErasingIndex(null)}
        />
      )}
    </div>
  );
}

/**
 * A brush-and-erase pass over one cut-out, for whatever the automatic pipeline
 * left behind — a stray prop, a watermark. Paints alpha to zero on a copy of
 * the cut-out's own canvas; "Apply" re-trims and re-encodes it the same way
 * the pipeline does (via `finalizeCutout`), so the result is a normal
 * `CutoutResult` the rest of the Workshop doesn't need to treat specially.
 */
function CutoutEraser({
  cutout,
  onApply,
  onCancel,
}: {
  cutout: CutoutResult;
  onApply: (next: CutoutResult) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const historyRef = useRef<ImageData[]>([]);
  const drawingRef = useRef(false);
  const [brush, setBrush] = useState(() => Math.max(6, Math.round(Math.min(cutout.width, cutout.height) * 0.06)));
  const [canUndo, setCanUndo] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

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
    try {
      const next = await finalizeCutout(canvas);
      if (!next) {
        onCancel();
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
      <div className="case-panel flex w-full max-w-2xl flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <span className="hallmark">Erase</span>
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

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ash">
            Brush
            <input
              type="range"
              min={brushMin}
              max={brushMax}
              value={brush}
              onChange={(e) => setBrush(Number(e.target.value))}
            />
          </label>
          <button type="button" onClick={undo} disabled={!canUndo} className="ghost-button disabled:opacity-40">
            Undo
          </button>
          <button type="button" onClick={loadOriginal} className="ghost-button">
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

function KindTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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

function Pane({
  label,
  tone,
  children,
}: {
  label: string;
  tone: 'plain' | 'checker';
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-[280px] items-center justify-center bg-velvet-900 p-6">
      {tone === 'checker' && (
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              'linear-gradient(45deg, #6b6b6b 25%, transparent 25%), linear-gradient(-45deg, #6b6b6b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #6b6b6b 75%), linear-gradient(-45deg, transparent 75%, #6b6b6b 75%)',
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
          }}
        />
      )}
      <span className="hallmark absolute left-4 top-3 z-10">{label}</span>
      <div className="relative z-10 flex max-h-[300px] items-center justify-center">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-bone">{label}</span>
      <div className="mt-2">{children}</div>
      {hint && <p className="mt-1.5 text-[11px] leading-snug text-ash/70">{hint}</p>}
    </label>
  );
}

function prettifyFilename(filename: string): string {
  return filename
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}
