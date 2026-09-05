import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_CALIBRATION,
  type Calibration,
  type EarringStyle,
  type JewelryItem,
  type JewelrySet,
  type NecklaceStyle,
  type PieceKind,
} from './types';

/**
 * A file-backed catalog. Deliberately boring: a JSON index next to PNGs on
 * disk. It runs anywhere with a writable filesystem and has no setup step.
 *
 * On a serverless host (Vercel, Netlify) the filesystem is ephemeral — replace
 * the two IO helpers with S3/R2 for the PNGs and Postgres for the index. The
 * exported function signatures are the seam; nothing above this file changes.
 */

const ROOT = process.cwd();
const INDEX_PATH = path.join(ROOT, 'data', 'catalog.json');
const SETS_PATH = path.join(ROOT, 'data', 'sets.json');
const STORAGE_DIR = path.join(ROOT, process.env.JEWELRY_STORAGE_DIR || 'public/jewelry');

/** Ships with the app so a fresh clone has something to try on immediately. */
const SEED: JewelryItem[] = [
  {
    id: 'seed-fine-chain',
    kind: 'necklace',
    name: 'Hairline chain',
    style: 'chain',
    material: '18k gold vermeil',
    imageUrl: '/necklaces/fine-chain.svg',
    thumbUrl: '/necklaces/fine-chain.svg',
    width: 800,
    height: 300,
    calibration: { ...DEFAULT_CALIBRATION, scale: 0.94, curve: 0.55 },
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'seed-teardrop',
    kind: 'necklace',
    name: 'Teardrop pendant',
    style: 'pendant',
    material: 'Rose-cut topaz, gold setting',
    imageUrl: '/necklaces/teardrop-pendant.svg',
    thumbUrl: '/necklaces/teardrop-pendant.svg',
    width: 800,
    height: 460,
    calibration: { ...DEFAULT_CALIBRATION, scale: 0.98, curve: 0.5 },
    createdAt: '2026-01-01T00:00:01.000Z',
  },
  {
    id: 'seed-pearl-choker',
    kind: 'necklace',
    name: 'Single-strand choker',
    style: 'choker',
    material: 'Freshwater pearl',
    imageUrl: '/necklaces/pearl-choker.svg',
    thumbUrl: '/necklaces/pearl-choker.svg',
    width: 800,
    height: 260,
    calibration: { ...DEFAULT_CALIBRATION, scale: 0.86, curve: 0.28, offsetY: -0.02 },
    createdAt: '2026-01-01T00:00:02.000Z',
  },
  {
    id: 'seed-pearl-studs',
    kind: 'earring',
    name: 'Pearl studs',
    style: 'stud',
    material: 'Freshwater pearl',
    imageUrl: '/earrings/pearl-stud.svg',
    thumbUrl: '/earrings/pearl-stud.svg',
    width: 200,
    height: 200,
    calibration: { ...DEFAULT_CALIBRATION, scale: 1 },
    createdAt: '2026-01-01T00:00:03.000Z',
  },
  {
    id: 'seed-gold-drops',
    kind: 'earring',
    name: 'Gold drops',
    style: 'drop',
    material: '18k gold vermeil',
    imageUrl: '/earrings/gold-drop.svg',
    thumbUrl: '/earrings/gold-drop.svg',
    width: 200,
    height: 360,
    calibration: { ...DEFAULT_CALIBRATION, scale: 1, offsetY: -0.05 },
    createdAt: '2026-01-01T00:00:04.000Z',
  },
];

/** Ready-made looks so the tray demonstrates pendant-only, earring-only, and combined sets. */
const SEED_SETS: JewelrySet[] = [
  {
    id: 'seed-set-teardrop-pearl',
    name: 'Teardrop & pearl studs',
    necklaceId: 'seed-teardrop',
    earringId: 'seed-pearl-studs',
    createdAt: '2026-01-01T00:00:05.000Z',
  },
  {
    id: 'seed-set-chain',
    name: 'Hairline chain',
    necklaceId: 'seed-fine-chain',
    earringId: null,
    createdAt: '2026-01-01T00:00:06.000Z',
  },
  {
    id: 'seed-set-choker-drops',
    name: 'Choker & gold drops',
    necklaceId: 'seed-pearl-choker',
    earringId: 'seed-gold-drops',
    createdAt: '2026-01-01T00:00:07.000Z',
  },
  {
    id: 'seed-set-drops',
    name: 'Gold drops',
    necklaceId: null,
    earringId: 'seed-gold-drops',
    createdAt: '2026-01-01T00:00:08.000Z',
  },
];

async function ensureDirs(): Promise<void> {
  await fs.mkdir(path.dirname(INDEX_PATH), { recursive: true });
  await fs.mkdir(STORAGE_DIR, { recursive: true });
}

async function readIndex(): Promise<JewelryItem[]> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(INDEX_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Items saved before sets existed have no `kind` — they were all necklaces.
    // Items saved before a calibration field (e.g. `spread`) existed are
    // missing it entirely, which would otherwise render as NaN offsets.
    type StoredItem = Omit<JewelryItem, 'kind' | 'calibration'> & {
      kind?: PieceKind;
      calibration?: Partial<Calibration>;
    };
    return (parsed as StoredItem[]).map((item) => ({
      ...item,
      kind: item.kind ?? 'necklace',
      calibration: { ...DEFAULT_CALIBRATION, ...item.calibration },
    }));
  } catch {
    return [];
  }
}

async function writeIndex(items: JewelryItem[]): Promise<void> {
  await ensureDirs();
  await fs.writeFile(INDEX_PATH, JSON.stringify(items, null, 2), 'utf8');
}

async function readSetsIndex(): Promise<JewelrySet[]> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(SETS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as JewelrySet[]) : [];
  } catch {
    return [];
  }
}

async function writeSetsIndex(sets: JewelrySet[]): Promise<void> {
  await ensureDirs();
  await fs.writeFile(SETS_PATH, JSON.stringify(sets, null, 2), 'utf8');
}

export async function listJewelry(): Promise<JewelryItem[]> {
  const stored = await readIndex();
  // Seeds always come first so the tray is never empty.
  return [...SEED, ...stored].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getJewelry(id: string): Promise<JewelryItem | null> {
  const all = await listJewelry();
  return all.find((i) => i.id === id) ?? null;
}

export async function listSets(): Promise<JewelrySet[]> {
  const stored = await readSetsIndex();
  return [...SEED_SETS, ...stored].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export interface CreateJewelryInput {
  kind: PieceKind;
  name: string;
  style: NecklaceStyle | EarringStyle;
  material: string;
  /** Cut-out PNG as a data URL. The browser already removed the background. */
  pngDataUrl: string;
  thumbDataUrl: string;
  width: number;
  height: number;
  /** Earrings only — set when the photo held a true left/right pair. */
  pairPngDataUrl?: string;
  pairThumbDataUrl?: string;
  pairWidth?: number;
  pairHeight?: number;
  calibration?: Partial<Calibration>;
}

export async function createJewelry(input: CreateJewelryInput): Promise<JewelryItem> {
  const stored = await readIndex();
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const imagePath = await writeDataUrl(input.pngDataUrl, `${id}.png`);
  const thumbPath = await writeDataUrl(input.thumbDataUrl, `${id}-thumb.png`);

  let pair: { imageUrl: string; thumbUrl: string; width: number; height: number } | undefined;
  if (input.pairPngDataUrl) {
    pair = {
      imageUrl: await writeDataUrl(input.pairPngDataUrl, `${id}-pair.png`),
      thumbUrl: await writeDataUrl(input.pairThumbDataUrl ?? input.pairPngDataUrl, `${id}-pair-thumb.png`),
      width: input.pairWidth ?? input.width,
      height: input.pairHeight ?? input.height,
    };
  }

  const item: JewelryItem = {
    id,
    kind: input.kind,
    name: input.name.trim() || 'Untitled piece',
    style: input.style,
    material: input.material.trim(),
    imageUrl: imagePath,
    thumbUrl: thumbPath,
    width: input.width,
    height: input.height,
    ...(pair
      ? { pairImageUrl: pair.imageUrl, pairThumbUrl: pair.thumbUrl, pairWidth: pair.width, pairHeight: pair.height }
      : {}),
    calibration: { ...DEFAULT_CALIBRATION, ...input.calibration },
    createdAt: new Date().toISOString(),
  };

  await writeIndex([...stored, item]);
  return item;
}

export interface CreateSetInput {
  name: string;
  necklaceId: string | null;
  earringId: string | null;
}

export async function createSet(input: CreateSetInput): Promise<JewelrySet> {
  if (!input.necklaceId && !input.earringId) {
    throw new Error('A set needs at least a pendant or a pair of earrings.');
  }

  const stored = await readSetsIndex();
  const id = `set-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const item: JewelrySet = {
    id,
    name: input.name.trim() || 'Untitled set',
    necklaceId: input.necklaceId,
    earringId: input.earringId,
    createdAt: new Date().toISOString(),
  };

  await writeSetsIndex([...stored, item]);
  return item;
}

export async function deleteSet(id: string): Promise<boolean> {
  const stored = await readSetsIndex();
  if (!stored.some((s) => s.id === id)) return false;
  await writeSetsIndex(stored.filter((s) => s.id !== id));
  return true;
}

export async function updateCalibration(id: string, calibration: Calibration): Promise<JewelryItem | null> {
  const stored = await readIndex();
  const idx = stored.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  stored[idx] = { ...stored[idx], calibration };
  await writeIndex(stored);
  return stored[idx];
}

/**
 * Re-tags a piece — necklace vs. earring, and the style within that kind.
 * Exists because the kind picked at upload time is easy to miss and, unlike
 * every other field, has no other way to fix once a piece is already saved.
 */
export async function updateJewelryKind(
  id: string,
  kind: PieceKind,
  style: NecklaceStyle | EarringStyle,
): Promise<JewelryItem | null> {
  const stored = await readIndex();
  const idx = stored.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  stored[idx] = { ...stored[idx], kind, style };
  await writeIndex(stored);
  return stored[idx];
}

export async function deleteJewelry(id: string): Promise<boolean> {
  const stored = await readIndex();
  const item = stored.find((i) => i.id === id);
  if (!item) return false;

  await writeIndex(stored.filter((i) => i.id !== id));
  await Promise.allSettled([
    fs.unlink(path.join(ROOT, 'public', item.imageUrl)),
    fs.unlink(path.join(ROOT, 'public', item.thumbUrl)),
    ...(item.pairImageUrl ? [fs.unlink(path.join(ROOT, 'public', item.pairImageUrl))] : []),
    ...(item.pairThumbUrl ? [fs.unlink(path.join(ROOT, 'public', item.pairThumbUrl))] : []),
  ]);

  // Drop the piece from any set that referenced it rather than leaving a
  // dangling id — an editable set can still lose one half and keep the other.
  const sets = await readSetsIndex();
  const touched = sets.map((s) => ({
    ...s,
    necklaceId: s.necklaceId === id ? null : s.necklaceId,
    earringId: s.earringId === id ? null : s.earringId,
  }));
  if (touched.some((s, i) => s.necklaceId !== sets[i].necklaceId || s.earringId !== sets[i].earringId)) {
    await writeSetsIndex(touched.filter((s) => s.necklaceId || s.earringId));
  }

  return true;
}

/** Decodes a data URL to disk and returns the public URL. */
async function writeDataUrl(dataUrl: string, filename: string): Promise<string> {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error('Expected a base64 PNG data URL.');

  await ensureDirs();
  await fs.writeFile(path.join(STORAGE_DIR, filename), Buffer.from(match[1], 'base64'));

  const publicRoot = path.join(ROOT, 'public');
  const rel = path.relative(publicRoot, path.join(STORAGE_DIR, filename));
  return `/${rel.split(path.sep).join('/')}`;
}

/** Returns null when the request is allowed, or a reason when it is not. */
export function checkAdminToken(header: string | null): string | null {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return null; // open in development
  if (!header || header !== `Bearer ${expected}`) return 'Admin token missing or incorrect.';
  return null;
}
