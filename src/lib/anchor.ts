import type { EarAnchor, NeckAnchor } from './types';

/**
 * Turning landmarks into a place to hang a necklace — or a pair of earrings.
 *
 * MediaPipe gives us 478 face points and 33 body points. Neither includes a
 * "neck" or an "earlobe", so we derive them. Shoulders are the better signal
 * for the neck when they are in frame — they give real width and true body
 * roll. When the shot is cropped to the head we fall back to jaw geometry,
 * which is less accurate but never disappears. Earlobes have no shoulder
 * equivalent, so they always ride on the jaw-derived roll and scale.
 */

type Pt = { x: number; y: number; z?: number; visibility?: number };
type XY = { x: number; y: number };

/** Face mesh indices we care about. */
const FACE = {
  CHIN: 152,
  BROW_TOP: 10,
  JAW_LEFT: 172,
  JAW_RIGHT: 397,
  NOSE_TIP: 1,
  /** Cheek points roughly level with the ear, on the same side as JAW_LEFT/RIGHT. */
  EAR_LEFT: 234,
  EAR_RIGHT: 454,
} as const;

/** Pose indices. "Left" is the subject's left, so it appears on the right of an unmirrored frame. */
const POSE = {
  SHOULDER_LEFT: 11,
  SHOULDER_RIGHT: 12,
  NOSE: 0,
} as const;

const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Tuning constants. These were set by eye against a webcam and are the first
 * thing to touch if pieces sit consistently high or wide.
 */
const T = {
  /** Necklace span as a fraction of shoulder-to-shoulder distance. */
  SHOULDER_WIDTH_RATIO: 0.6,
  /**
   * Fallback span as a multiple of jaw width, when shoulders are missing.
   * Calibrated so it lands within a few percent of the shoulder-derived width
   * on an average adult (shoulder span runs about 2.3x jaw width). If the two
   * disagree, the necklace visibly jumps size the moment shoulders leave frame.
   */
  JAW_WIDTH_RATIO: 1.4,
  /** How far down the chin-to-shoulder gap the collarbone hollow sits. */
  DROP_RATIO: 0.26,
  /** Fallback drop as a fraction of face height. */
  FALLBACK_DROP_RATIO: 0.24,
  /** Shoulders sway more than the head; trust the chin for horizontal centring. */
  CENTRE_BLEND: 0.62,
  /** How much a turned head narrows the visible necklace. */
  YAW_SQUASH: 0.38,
  /** How far a turned head slides the necklace across the chest. */
  YAW_SHIFT: 0.14,
  MIN_SHOULDER_VISIBILITY: 0.55,
  /** Earring span as a multiple of jaw width — small, unlike the necklace. */
  EAR_WIDTH_RATIO: 0.3,
  /** How far below the cheek point the earlobe sits, as a fraction of face height. */
  EAR_DROP_RATIO: 0.13,
} as const;

export interface AnchorResult {
  neck: NeckAnchor | null;
  earL: EarAnchor | null;
  earR: EarAnchor | null;
  usedShoulders: boolean;
}

export function computeNeckAnchor(
  face: Pt[] | null,
  pose: Pt[] | null,
  frameW: number,
  frameH: number,
): AnchorResult {
  if (!face || face.length < 400) return { neck: null, earL: null, earR: null, usedShoulders: false };

  const px = (p: Pt): XY => ({ x: p.x * frameW, y: p.y * frameH });

  const chin = px(face[FACE.CHIN]);
  const browTop = px(face[FACE.BROW_TOP]);
  const jawL = px(face[FACE.JAW_LEFT]);
  const jawR = px(face[FACE.JAW_RIGHT]);
  const nose = px(face[FACE.NOSE_TIP]);
  const earL = px(face[FACE.EAR_LEFT]);
  const earR = px(face[FACE.EAR_RIGHT]);

  const faceHeight = dist(browTop, chin);
  const jawWidth = dist(jawL, jawR);
  if (faceHeight < 8 || jawWidth < 8) return { neck: null, earL: null, earR: null, usedShoulders: false };

  // --- Yaw, from how far the nose has slid off the jaw midline -------------
  // Cheaper and steadier than decomposing the facial transformation matrix,
  // and we only need a rough turn amount.
  const jawMidX = (jawL.x + jawR.x) / 2;
  const yawRatio = clamp((nose.x - jawMidX) / (jawWidth / 2), -1, 1);
  const yawScale = clamp(1 - Math.abs(yawRatio) * T.YAW_SQUASH, 0.55, 1);

  // --- Preferred path: shoulders in frame ---------------------------------
  const sl = pose?.[POSE.SHOULDER_LEFT];
  const sr = pose?.[POSE.SHOULDER_RIGHT];
  const shouldersVisible =
    !!sl && !!sr &&
    (sl.visibility ?? 1) > T.MIN_SHOULDER_VISIBILITY &&
    (sr.visibility ?? 1) > T.MIN_SHOULDER_VISIBILITY;

  let x: number;
  let y: number;
  let width: number;
  let roll: number;
  let confidence: number;

  if (shouldersVisible) {
    const a = px(sl!);
    const b = px(sr!);
    const shoulderSpan = dist(a, b);
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;

    roll = Math.atan2(a.y - b.y, a.x - b.x);
    width = shoulderSpan * T.SHOULDER_WIDTH_RATIO;
    x = chin.x * T.CENTRE_BLEND + midX * (1 - T.CENTRE_BLEND);
    y = chin.y + (midY - chin.y) * T.DROP_RATIO;
    confidence = 1;

    // A shoulder span far out of proportion to the head usually means the pose
    // model latched onto something else. Fall back rather than draw nonsense.
    const ratio = shoulderSpan / jawWidth;
    if (ratio < 1.3 || ratio > 6) {
      return withFallback();
    }
  } else {
    return withFallback();
  }

  x += yawRatio * jawWidth * T.YAW_SHIFT;

  // Confidence drops near the frame edge so the overlay can fade instead of pop.
  const edge = Math.min(x, frameW - x, y, frameH - y);
  confidence *= clamp(edge / (frameW * 0.06), 0, 1);

  // Earlobes always ride on the jaw-derived roll, whether or not shoulders are
  // in frame — a visible shoulder tells us nothing extra about ear position.
  const jawRoll = Math.atan2(jawR.y - jawL.y, jawR.x - jawL.x);

  return {
    neck: { x, y, width, roll, yawScale, confidence },
    earL: earAt(earL, jawRoll, yawScale),
    earR: earAt(earR, jawRoll, yawScale),
    usedShoulders: true,
  };

  function withFallback(): AnchorResult {
    const fRoll = Math.atan2(jawR.y - jawL.y, jawR.x - jawL.x);
    const fWidth = jawWidth * T.JAW_WIDTH_RATIO;
    let fx = chin.x + yawRatio * jawWidth * T.YAW_SHIFT;
    // Push the drop along the head's own down-axis so it follows a tilted head.
    const fy = chin.y + faceHeight * T.FALLBACK_DROP_RATIO * Math.cos(fRoll);
    fx += faceHeight * T.FALLBACK_DROP_RATIO * Math.sin(fRoll);

    const edge = Math.min(fx, frameW - fx, fy, frameH - fy);
    return {
      neck: {
        x: fx,
        y: fy,
        width: fWidth,
        roll: fRoll,
        yawScale,
        confidence: 0.75 * clamp(edge / (frameW * 0.06), 0, 1),
      },
      earL: earAt(earL, fRoll, yawScale),
      earR: earAt(earR, fRoll, yawScale),
      usedShoulders: false,
    };
  }

  /** Places one earring below a cheek landmark, along the head's own down-axis. */
  function earAt(cheekPt: XY, earRoll: number, earYawScale: number): EarAnchor {
    const drop = faceHeight * T.EAR_DROP_RATIO;
    const ex = cheekPt.x + drop * Math.sin(earRoll);
    const ey = cheekPt.y + drop * Math.cos(earRoll);
    const earEdge = Math.min(ex, frameW - ex, ey, frameH - ey);
    return {
      x: ex,
      y: ey,
      width: jawWidth * T.EAR_WIDTH_RATIO,
      roll: earRoll,
      yawScale: earYawScale,
      confidence: 0.85 * clamp(earEdge / (frameW * 0.05), 0, 1),
    };
  }
}
