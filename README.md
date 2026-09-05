# Aurea — necklace try-on

Point a camera at yourself, pick a necklace, and it hangs where it would in life.
Upload a product photo and the background comes off automatically, leaving only
the piece.

Built with Next.js 14 (App Router), MediaPipe Tasks Vision, and IMG.LY's
background removal running in the browser.

---

## Two halves

**Ingestion** (`/admin`) turns a product photo into a wearable overlay.
**Try-on** (`/`) works out where a necklace would sit on you and keeps it there.

```
  UPLOAD                                  TRY-ON
  ──────                                  ──────
  product photo                           camera frame
       │                                       │
       ▼                                       ▼
  ISNet matting          ┌────────────►  FaceLandmarker (478 pts)
       │                 │                     +
       ▼                 │               PoseLandmarker (33 pts)
  despeckle              │                     │
  decontaminate          │                     ▼
  tighten alpha          │               computeNeckAnchor
  trim to bounds         │               x, y, width, roll, yaw
       │                 │                     │
       ▼                 │                     ▼
  transparent PNG ───────┘               One Euro filter
  + calibration                                │
       │                                       ▼
       ▼                                 warp + shadow
  catalog (JSON + disk)  ────────────►   composite to canvas
```

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

Three sample necklaces ship with the repo, so the mirror works before you
upload anything. Add your own at `/admin`.

Optional `.env`:

```
ADMIN_TOKEN=some-secret     # required to add or delete pieces; open if unset
JEWELRY_STORAGE_DIR=public/jewelry
```

## How the necklace gets positioned

MediaPipe gives 478 face points and 33 body points. Neither includes a neck, so
`src/lib/anchor.ts` derives one:

- **Shoulders visible** — width comes from shoulder span × 0.6, roll from the
  shoulder line, and the anchor sits 26% of the way down the chin-to-shoulder
  gap. This is the accurate path.
- **Shoulders not visible** — width falls back to jaw width × 1.4, roll to the
  jaw line. The two constants are calibrated to land within about 2% of each
  other on an average adult, so nothing jumps when shoulders leave frame.
- **Head turned** — yaw is read from how far the nose has slid off the jaw
  midline, then squashes the necklace horizontally and slides it across the chest.
- **Sanity check** — if shoulder span comes back at an implausible ratio to the
  head, the pose result is discarded rather than drawn.

Raw landmarks jitter. A One Euro filter (`src/lib/oneEuro.ts`) smooths hard when
you hold still and lets go when you move, which avoids the lag you get from
plain exponential smoothing.

Two touches sell the composite in `src/lib/renderer.ts`: the chain is sliced
into 48 vertical strips and offset along a parabola so the middle hangs lower
than the ends, and a blurred dark copy sits underneath as a contact shadow. Both
are cached in an offscreen buffer keyed on quantised width/curve/yaw, so the
warp only recomputes when the shape actually changes.

## How the background comes off

Segmentation alone is not enough — raw output leaves a halo around thin chain
links, stray blobs where a hand or prop was, a display prop (a bust, a stand)
welded straight onto the piece with no gap the matte could ever separate, and a
large transparent margin that breaks the scaling maths. `src/lib/cutout.ts`
runs six stages:

1. **Segment** — ISNet alpha matte via `@imgly/background-removal`.
2. **Despeckle** — flood-fill every opaque region, bridging small gaps first
   (so a strand of separate beads reads as one piece, not noise), keep the
   largest plus anything big enough to be a real element, erase the rest.
   This is what removes a hand or a price tag without touching the chain.
3. **Strip prop** — peel away a smooth display prop fused to the piece at the
   frame's edge: flood-fill inward from the canvas border through low-texture
   opaque pixels only, stopping the moment real jewellery detail (a facet, a
   bead) is hit. Backs off entirely if it would erase too much of the piece.
4. **Decontaminate** — semi-transparent edge pixels still carry the old
   background's colour and show as a pale rim over skin, so each is re-weighted
   toward its solid neighbours.
5. **Tighten** — steepen the alpha ramp so fine chains read crisp.
6. **Trim** — crop to the piece and record the true aspect ratio.

This runs in the browser. The first cut of a session downloads roughly 40 MB of
model weights; after that every upload is free, private, and needs no server GPU.
Photos are never uploaded — only the finished cut-out is sent.

## Tuning

Per-piece adjustments live in the fit card on the right of the mirror: drop,
sway, size, drape, tilt, shadow, opacity. Save them and they become that piece's
defaults for everyone.

Global constants are in the `T` block at the top of `src/lib/anchor.ts`. Start
there if pieces sit consistently high or wide across every necklace.

## Layout

```
src/
  app/
    page.tsx                 mirror
    admin/page.tsx           workshop
    api/jewelry/             catalog REST
  lib/
    anchor.ts                landmarks -> a place to hang a necklace
    tracker.ts               MediaPipe wrapper, both graphs
    oneEuro.ts               adaptive smoothing
    renderer.ts              drape warp, contact shadow, buffer cache
    cutout.ts                the six-stage background removal
    catalog.ts               file-backed store
    store.ts                 client state
  hooks/useTryOnEngine.ts    camera, render loop, capture
  components/                MirrorStage, Workshop, JewelryTray, SpecRail
```

## Before production

- **Self-host the models.** `TRACKER_ASSETS` in `src/lib/tracker.ts` points at
  Google's buckets. Fine for development; you do not want a third party in your
  critical path in production.
- **Replace the catalog.** `src/lib/catalog.ts` writes JSON and PNGs to disk,
  which does not survive a serverless deploy. Swap the IO helpers for S3/R2 plus
  a real database — the exported function signatures are the seam, and nothing
  above that file changes.
- **Cross-origin isolation** is already set in `next.config.mjs` (COOP
  `same-origin`, COEP `credentialless`). It lets onnxruntime use threaded WASM,
  worth roughly 3-4× on cutting. Check it does not conflict with any embeds you
  add later.
- **Consider a worker.** Inference currently runs on the main thread. Moving it
  to a worker with OffscreenCanvas is the right next step for low-end phones.

## Known limits

- One face at a time. Multiple people in frame track the most prominent.
- No occlusion: the necklace draws over hair and chin rather than behind them.
  Real occlusion needs a segmentation mask per frame, which roughly doubles cost.
- The millimetre readout is a rough guide derived from measured shoulder span,
  not a calibrated measurement.
- Very reflective or transparent stones confuse the matting model. Shoot on a
  plain, contrasting surface.
