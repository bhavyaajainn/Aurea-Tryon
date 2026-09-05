# Aurea — virtual jewelry try-on

Upload a photo of your own necklace or earrings, point a camera at yourself,
and it hangs where it would in life. No catalog, no admin, no account —
everything happens in this one browser tab, for this one visitor.

Built with Next.js 15 (App Router), MediaPipe Tasks Vision, and IMG.LY's
background removal running client-side.

---

## The journey

```
  UPLOAD                                  MIRROR
  ──────                                  ──────
  necklace / left ear / right ear         camera frame
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
  straighten (rotate)    │               One Euro filter
  + smart eraser         │                     │
       │                 │                     ▼
       ▼                 │               warp + shadow
  transparent PNG ───────┘               composite to canvas
  (kept in memory only)                        │
                                                ▼
                                          Save picture (download)
```

Nothing crosses the network except the piece's own cut-out (processed
entirely in the browser) and, once, the ~40 MB matting model. No server
database, no localStorage, no account — close the tab and it's gone.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

No `.env` is required. Optionally set `NEXT_PUBLIC_SITE_URL` before deploying
so the sitemap, robots.txt, and Open Graph tags point at your real domain
instead of the placeholder in `src/lib/site.ts`.

If you have no jewellery photo handy, three sample looks ship with the app
(`src/lib/seeds.ts`) so the mirror can be tried immediately.

## The upload step

Each of the three boxes — necklace/pendant, left earring, right earring — is
independent and optional; at least one has to be filled to continue.

1. **Cut-out** — `@imgly/background-removal`'s ISNet model segments the piece
   by shape, not by colour-keying a background, so a plain white seamless, a
   black velvet pad, or a busy tabletop all work the same way.
2. **Straighten** — quarter-turn buttons plus a fine slider re-rotate the
   already-cut piece (via `rotateCutout` in `src/lib/cutout.ts`) and re-trim
   it, so levelling a photo shot at an angle is instant — no re-running the
   matting model.
3. **Smart eraser** — a brush that paints stray background, a display prop,
   or a watermark to transparent, then re-crops.

Filling only the left-earring box wears that piece on both ears, mirrored.
Filling both sides wears each exactly as photographed, no mirroring.

## The mirror step

MediaPipe gives 478 face points and 33 body points. Neither includes a neck,
so `src/lib/anchor.ts` derives one:

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
than the ends, and a blurred dark copy sits underneath as a contact shadow.

The fit card (`SpecRail`) exposes drop, sway, size, drape, tilt, shadow, and
opacity — each with a plain-language description of what it does — plus
spread for a pair of earrings. Nothing is ever saved back anywhere: reset
puts a piece back to its default, and reloading the page starts over.

The mirror can run full-screen (top-right toggle) or inline, live from the
camera or against an uploaded photo, and "Save picture" downloads exactly
what's on screen as a PNG — that download is the only thing this app ever
writes to your device.

## SEO

- `src/app/layout.tsx` — full metadata: title template, description,
  keywords, Open Graph + Twitter cards, canonical URL, robots directives,
  and JSON-LD (`WebApplication`) structured data.
- `src/app/sitemap.ts`, `src/app/robots.ts`, `src/app/manifest.ts` — generated,
  not hand-maintained.
- `src/app/opengraph-image.tsx`, `icon.tsx`, `apple-icon.tsx` — generated at
  build time with `next/og`, no binary assets to keep in sync.
- The homepage is fully static (no server data fetch), which keeps it fast —
  Core Web Vitals matter for ranking as much as on-page content does.

No name or copy can guarantee a #1 ranking on its own — that also depends on
backlinks, domain age, and how competitive the term is, none of which live in
this codebase. This gets the on-page half right.

## Layout

```
src/
  app/
    page.tsx                 the whole journey lives behind TryOnApp
    layout.tsx, sitemap.ts, robots.ts, manifest.ts, opengraph-image.tsx, icon.tsx
  lib/
    anchor.ts                landmarks -> a place to hang a necklace
    tracker.ts               MediaPipe wrapper, both graphs
    oneEuro.ts               adaptive smoothing
    renderer.ts              drape warp, contact shadow, buffer cache
    cutout.ts                six-stage background removal + rotate
    seeds.ts                 the static sample looks
    site.ts                  SEO constants (name, description, URL)
    store.ts                 client state — the wizard step and the worn pieces
  hooks/useTryOnEngine.ts    camera, render loop, capture
  components/
    TryOnApp.tsx             the upload step + hands off to the mirror
    PieceUploader.tsx         one upload box: cut, straighten, erase
    CutoutEraser.tsx          the brush-erase modal
    MirrorStage.tsx           the camera / photo stage
    SpecRail.tsx              the fit card
```

## Before production

- **Self-host the models.** `TRACKER_ASSETS` in `src/lib/tracker.ts` points at
  Google's buckets, and the matting model comes from IMG.LY's CDN. Fine for
  development; you do not want a third party in your critical path in
  production.
- **Cross-origin isolation** is already set in `next.config.mjs` (COOP
  `same-origin`, COEP `credentialless`). It lets onnxruntime use threaded WASM,
  worth roughly 3-4× on cutting. Check it does not conflict with any embeds you
  add later.
- **Consider a worker.** Inference currently runs on the main thread. Moving it
  to a worker with OffscreenCanvas is the right next step for low-end phones.
- **Set `NEXT_PUBLIC_SITE_URL`** to the real deployed domain so sitemap,
  robots, and social previews stop pointing at the placeholder.

## Known limits

- One face at a time. Multiple people in frame track the most prominent.
- No occlusion: the necklace draws over hair and chin rather than behind them.
  Real occlusion needs a segmentation mask per frame, which roughly doubles cost.
- The millimetre readout is a rough guide derived from measured shoulder span,
  not a calibrated measurement.
- Very reflective or transparent stones confuse the matting model. Shoot on a
  plain, contrasting surface.

  Try it - https://www.aureatryon.store/
