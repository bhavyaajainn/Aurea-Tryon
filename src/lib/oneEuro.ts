/**
 * One Euro filter (Casiez, Roussel & Vogel, 2012).
 *
 * Plain exponential smoothing forces a choice between jitter when still and lag
 * when moving. This adapts: it smooths hard at low speed and lets go at high
 * speed, which is exactly what a necklace pinned to a moving head needs.
 */
export class OneEuroFilter {
  private hatX: number | null = null;
  private hatDx = 0;
  private lastTime: number | null = null;

  constructor(
    private minCutoff = 1.2,
    private beta = 0.02,
    private dCutoff = 1.0,
  ) {}

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(value: number, timestampMs: number): number {
    if (this.hatX === null || this.lastTime === null) {
      this.hatX = value;
      this.lastTime = timestampMs;
      return value;
    }

    const dt = Math.max((timestampMs - this.lastTime) / 1000, 1e-3);
    this.lastTime = timestampMs;

    const dx = (value - this.hatX) / dt;
    this.hatDx = OneEuroFilter.alpha(this.dCutoff, dt) * dx + (1 - OneEuroFilter.alpha(this.dCutoff, dt)) * this.hatDx;

    const cutoff = this.minCutoff + this.beta * Math.abs(this.hatDx);
    const a = OneEuroFilter.alpha(cutoff, dt);
    this.hatX = a * value + (1 - a) * this.hatX;
    return this.hatX;
  }

  reset(): void {
    this.hatX = null;
    this.hatDx = 0;
    this.lastTime = null;
  }
}

/** Filters a whole anchor at once so every channel stays in step. */
export class AnchorSmoother {
  private x = new OneEuroFilter(1.0, 0.03);
  private y = new OneEuroFilter(1.0, 0.03);
  private width = new OneEuroFilter(0.6, 0.008);
  private roll = new OneEuroFilter(0.9, 0.02);
  private yaw = new OneEuroFilter(0.8, 0.01);

  apply<T extends { x: number; y: number; width: number; roll: number; yawScale: number }>(a: T, t: number): T {
    return {
      ...a,
      x: this.x.filter(a.x, t),
      y: this.y.filter(a.y, t),
      width: this.width.filter(a.width, t),
      roll: this.roll.filter(a.roll, t),
      yawScale: this.yaw.filter(a.yawScale, t),
    };
  }

  reset(): void {
    [this.x, this.y, this.width, this.roll, this.yaw].forEach((f) => f.reset());
  }
}
