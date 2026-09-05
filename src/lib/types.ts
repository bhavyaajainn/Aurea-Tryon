/** Shared types for the catalog and the try-on engine. */

export type NecklaceStyle = 'chain' | 'pendant' | 'choker' | 'collar' | 'statement' | 'layered';
export type EarringStyle = 'stud' | 'hoop' | 'drop' | 'chandelier' | 'huggie';

export const NECKLACE_STYLES: NecklaceStyle[] = ['chain', 'pendant', 'choker', 'collar', 'statement', 'layered'];
export const EARRING_STYLES: EarringStyle[] = ['stud', 'hoop', 'drop', 'chandelier', 'huggie'];

/** What a single cut-out actually is, and therefore which anchor it follows. */
export type PieceKind = 'necklace' | 'earring';

/**
 * Per-piece placement adjustments. All values are relative so a calibration
 * saved on one face still works on another.
 */
export interface Calibration {
  /** Horizontal nudge, as a fraction of necklace width. */
  offsetX: number;
  /** Vertical nudge, as a fraction of necklace width. Positive = lower on the chest. */
  offsetY: number;
  /** Multiplier on the auto-computed width. 1 = leave as measured. */
  scale: number;
  /** Extra tilt in radians, added to the wearer's shoulder roll. */
  rotation: number;
  /** How much the chain sags in the middle. 0 = flat, 1 = deep drape. */
  curve: number;
  /** 0-1. Below 1 the piece reads as sheer, which helps thin chains blend. */
  opacity: number;
  /** Contact shadow strength against the skin. 0-1. */
  shadow: number;
  /**
   * Earrings only. Pushes each earring away from the other, as a fraction of
   * its own width. 0 = leave at the measured earlobe position. Negative
   * pulls them in toward each other instead.
   */
  spread: number;
}

export const DEFAULT_CALIBRATION: Calibration = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  rotation: 0,
  curve: 0.45,
  opacity: 1,
  shadow: 0.5,
  spread: 0,
};

/**
 * How a necklace sits on the neck, at a glance — the one thing most people
 * already know about their own piece without measuring anything. Used to pick
 * a sane starting fit instead of dropping every upload at the same default.
 */
export type NecklaceLength = 'choker' | 'standard' | 'long';

export const NECKLACE_LENGTH_PRESETS: Record<NecklaceLength, Partial<Calibration>> = {
  // Sits snug at the throat: little to no drop, almost no slack.
  choker: { offsetY: -0.3, curve: 0.15 },
  // The common case: rests at the collarbone, a natural amount of drape.
  standard: { offsetY: 0, curve: 0.45 },
  // Falls well below the collarbone: more drop, more slack in the chain.
  long: { offsetY: 0.3, curve: 0.65 },
};

export const NECKLACE_LENGTH_LABELS: Record<NecklaceLength, string> = {
  choker: 'Choker',
  standard: 'Standard',
  long: 'Long',
};

export interface JewelryItem {
  id: string;
  /** Which anchor this piece follows: the collarbone hollow, or an earlobe. */
  kind: PieceKind;
  name: string;
  style: NecklaceStyle | EarringStyle;
  /** Free text: "18k gold vermeil", "freshwater pearl", etc. */
  material: string;
  /** Cut-out PNG with a transparent background. */
  imageUrl: string;
  /** Small preview, also transparent. */
  thumbUrl: string;
  /** Natural pixel size of the cut-out, used to keep aspect ratio. */
  width: number;
  height: number;
  /**
   * Earrings only. Set when the source photo showed a true left/right pair —
   * `imageUrl` is worn on the left ear and this on the right, each used as
   * photographed. When absent, `imageUrl` is mirrored onto both ears instead.
   */
  pairImageUrl?: string;
  pairThumbUrl?: string;
  pairWidth?: number;
  pairHeight?: number;
  calibration: Calibration;
  createdAt: string;
}

/** What the tracker hands the renderer each frame. */
export interface NeckAnchor {
  /** Centre of the collarbone hollow, in canvas pixels. */
  x: number;
  y: number;
  /** Measured span the necklace should cover, in canvas pixels. */
  width: number;
  /** Head/shoulder tilt in radians. */
  roll: number;
  /** 0.55-1. Horizontal squash when the head turns away from camera. */
  yawScale: number;
  /** 0-1. Drops when the face is partly out of frame or moving fast. */
  confidence: number;
}

/** Same shape as a neck anchor — an earlobe is just a smaller place to hang metal. */
export type EarAnchor = NeckAnchor;

export interface TrackerFrame {
  anchor: NeckAnchor | null;
  /** Left/right are anatomical (the wearer's own), not screen-left/right. */
  earL: EarAnchor | null;
  earR: EarAnchor | null;
  /** True once both models have loaded and at least one face was seen. */
  hasFace: boolean;
  /** True when shoulders were visible, which gives a much better width. */
  hasShoulders: boolean;
}
