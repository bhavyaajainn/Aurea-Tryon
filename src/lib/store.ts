'use client';

import { create } from 'zustand';
import { DEFAULT_CALIBRATION, type Calibration, type JewelryItem, type JewelrySet } from './types';
import type { TrackerQuality } from './tracker';

export type StageMode = 'camera' | 'photo';

interface TryOnState {
  items: JewelryItem[];
  sets: JewelrySet[];
  selectedSetId: string | null;
  /** Live calibrations, seeded from the selected set's pieces and edited in the spec rail. */
  necklaceCalibration: Calibration;
  earringCalibration: Calibration;
  mirror: boolean;
  quality: TrackerQuality;
  mode: StageMode;
  /** Object URL of an uploaded photo, when mode is 'photo'. */
  photoUrl: string | null;
  showGuides: boolean;

  setCatalog: (items: JewelryItem[], sets: JewelrySet[]) => void;
  updateItem: (item: JewelryItem) => void;
  removeSet: (id: string) => void;
  selectSet: (id: string | null) => void;
  patchNecklaceCalibration: (patch: Partial<Calibration>) => void;
  patchEarringCalibration: (patch: Partial<Calibration>) => void;
  resetCalibration: () => void;
  setMirror: (v: boolean) => void;
  setQuality: (q: TrackerQuality) => void;
  setMode: (m: StageMode) => void;
  setPhotoUrl: (url: string | null) => void;
  toggleGuides: () => void;
}

/** Reads the live calibration for both halves of a set straight off the catalog. */
function calibrationsFor(
  items: JewelryItem[],
  set: JewelrySet | undefined,
): { necklaceCalibration: Calibration; earringCalibration: Calibration } {
  const necklace = set?.necklaceId ? items.find((i) => i.id === set.necklaceId) : undefined;
  const earring = set?.earringId ? items.find((i) => i.id === set.earringId) : undefined;
  return {
    necklaceCalibration: necklace ? { ...necklace.calibration } : { ...DEFAULT_CALIBRATION },
    earringCalibration: earring ? { ...earring.calibration } : { ...DEFAULT_CALIBRATION },
  };
}

export const useTryOn = create<TryOnState>((set, get) => ({
  items: [],
  sets: [],
  selectedSetId: null,
  necklaceCalibration: { ...DEFAULT_CALIBRATION },
  earringCalibration: { ...DEFAULT_CALIBRATION },
  mirror: true,
  quality: 'balanced',
  mode: 'camera',
  photoUrl: null,
  showGuides: false,

  setCatalog: (items, sets) =>
    set((s) => {
      const stillThere = sets.some((st) => st.id === s.selectedSetId);
      const nextId = stillThere ? s.selectedSetId : sets[0]?.id ?? null;
      const next = sets.find((st) => st.id === nextId);
      return { items, sets, selectedSetId: nextId, ...calibrationsFor(items, next) };
    }),

  updateItem: (item) => set((s) => ({ items: s.items.map((i) => (i.id === item.id ? item : i)) })),

  removeSet: (id) =>
    set((s) => {
      const sets = s.sets.filter((st) => st.id !== id);
      if (s.selectedSetId !== id) return { sets };
      const next = sets[0];
      return { sets, selectedSetId: next?.id ?? null, ...calibrationsFor(s.items, next) };
    }),

  selectSet: (id) => {
    const { sets, items } = get();
    set({ selectedSetId: id, ...calibrationsFor(items, sets.find((st) => st.id === id)) });
  },

  patchNecklaceCalibration: (patch) =>
    set((s) => ({ necklaceCalibration: { ...s.necklaceCalibration, ...patch } })),
  patchEarringCalibration: (patch) =>
    set((s) => ({ earringCalibration: { ...s.earringCalibration, ...patch } })),

  resetCalibration: () => {
    const { items, sets, selectedSetId } = get();
    set(calibrationsFor(items, sets.find((st) => st.id === selectedSetId)));
  },

  setMirror: (mirror) => set({ mirror }),
  setQuality: (quality) => set({ quality }),
  setMode: (mode) => set({ mode }),
  setPhotoUrl: (photoUrl) => set({ photoUrl }),
  toggleGuides: () => set((s) => ({ showGuides: !s.showGuides })),
}));

export const selectedSet = (s: TryOnState): JewelrySet | null =>
  s.sets.find((st) => st.id === s.selectedSetId) ?? null;

export const selectedNecklace = (s: TryOnState): JewelryItem | null => {
  const set = selectedSet(s);
  return set?.necklaceId ? s.items.find((i) => i.id === set.necklaceId) ?? null : null;
};

export const selectedEarring = (s: TryOnState): JewelryItem | null => {
  const set = selectedSet(s);
  return set?.earringId ? s.items.find((i) => i.id === set.earringId) ?? null : null;
};
