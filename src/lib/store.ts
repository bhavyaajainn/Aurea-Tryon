'use client';

import { create } from 'zustand';
import { DEFAULT_CALIBRATION, type Calibration, type JewelryItem } from './types';
import type { TrackerQuality } from './tracker';

export type StageMode = 'camera' | 'photo';
export type WizardStep = 'upload' | 'studio';

interface TryOnState {
  step: WizardStep;
  necklace: JewelryItem | null;
  earring: JewelryItem | null;
  /** Live calibrations, seeded from whichever piece is worn and edited in the spec rail. */
  necklaceCalibration: Calibration;
  earringCalibration: Calibration;
  mirror: boolean;
  quality: TrackerQuality;
  mode: StageMode;
  /** Object URL of an uploaded photo, when mode is 'photo'. */
  photoUrl: string | null;
  showGuides: boolean;

  setStep: (step: WizardStep) => void;
  wearPieces: (necklace: JewelryItem | null, earring: JewelryItem | null) => void;
  patchNecklaceCalibration: (patch: Partial<Calibration>) => void;
  patchEarringCalibration: (patch: Partial<Calibration>) => void;
  resetCalibration: () => void;
  setMirror: (v: boolean) => void;
  setQuality: (q: TrackerQuality) => void;
  setMode: (m: StageMode) => void;
  setPhotoUrl: (url: string | null) => void;
  toggleGuides: () => void;
}

export const useTryOn = create<TryOnState>((set, get) => ({
  step: 'upload',
  necklace: null,
  earring: null,
  necklaceCalibration: { ...DEFAULT_CALIBRATION },
  earringCalibration: { ...DEFAULT_CALIBRATION },
  mirror: true,
  quality: 'balanced',
  mode: 'camera',
  photoUrl: null,
  showGuides: false,

  setStep: (step) => set({ step }),

  wearPieces: (necklace, earring) => {
    // A stale Photo-mode session (mode + the uploaded photo's object URL)
    // otherwise survives across pieces: leaving the mirror and entering it
    // again with a different piece would silently reopen on the previous
    // photo instead of a fresh Live view.
    const { photoUrl } = get();
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    set({
      necklace,
      earring,
      necklaceCalibration: necklace ? { ...necklace.calibration } : { ...DEFAULT_CALIBRATION },
      earringCalibration: earring ? { ...earring.calibration } : { ...DEFAULT_CALIBRATION },
      mode: 'camera',
      photoUrl: null,
    });
  },

  patchNecklaceCalibration: (patch) =>
    set((s) => ({ necklaceCalibration: { ...s.necklaceCalibration, ...patch } })),
  patchEarringCalibration: (patch) =>
    set((s) => ({ earringCalibration: { ...s.earringCalibration, ...patch } })),

  resetCalibration: () => {
    const { necklace, earring } = get();
    set({
      necklaceCalibration: necklace ? { ...necklace.calibration } : { ...DEFAULT_CALIBRATION },
      earringCalibration: earring ? { ...earring.calibration } : { ...DEFAULT_CALIBRATION },
    });
  },

  setMirror: (mirror) => set({ mirror }),
  setQuality: (quality) => set({ quality }),
  setMode: (mode) => set({ mode }),
  setPhotoUrl: (photoUrl) => set({ photoUrl }),
  toggleGuides: () => set((s) => ({ showGuides: !s.showGuides })),
}));
