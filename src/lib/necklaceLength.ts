import type { NecklaceLength } from './types';

/**
 * Guesses how a necklace is worn from the shape of its cut-out. Product
 * photos are almost always cropped wider than tall, so it's the *degree* of
 * flatness that carries the signal: a closed band with no pendant reads as a
 * short, wide box (a choker); a piece with real vertical drop — a pendant, a
 * lariat, layered strands — reads as noticeably taller relative to its width.
 * This is a starting point, not a measurement — callers should let the
 * wearer override it in one tap rather than treat it as final.
 */
export function detectNecklaceLength(width: number, height: number): NecklaceLength {
  if (width <= 0 || height <= 0) return 'standard';
  const ratio = height / width;
  if (ratio <= 0.32) return 'choker';
  if (ratio >= 0.55) return 'long';
  return 'standard';
}
