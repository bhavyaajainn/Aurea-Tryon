import { DEFAULT_CALIBRATION, type JewelryItem } from './types';

/**
 * Ships with the app so a visitor can see the mirror work before uploading
 * anything of their own. Purely static — no catalog, no disk, no admin.
 */
export const SEED_NECKLACES: JewelryItem[] = [
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
];

export const SEED_EARRINGS: JewelryItem[] = [
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

/** A ready-made look, so "try a sample" can fill all three upload boxes in one tap. */
export interface SeedLook {
  id: string;
  name: string;
  necklace: JewelryItem | null;
  earring: JewelryItem | null;
}

export const SEED_LOOKS: SeedLook[] = [
  { id: 'seed-look-teardrop', name: 'Teardrop & pearl studs', necklace: SEED_NECKLACES[1], earring: SEED_EARRINGS[0] },
  { id: 'seed-look-chain', name: 'Hairline chain', necklace: SEED_NECKLACES[0], earring: null },
  { id: 'seed-look-choker', name: 'Choker & gold drops', necklace: SEED_NECKLACES[2], earring: SEED_EARRINGS[1] },
];
