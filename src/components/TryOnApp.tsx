'use client';

import { useEffect, useState } from 'react';
import { nanoid } from 'nanoid';
import type { CutoutResult } from '@/lib/cutout';
import { SEED_LOOKS, type SeedLook } from '@/lib/seeds';
import { DEFAULT_CALIBRATION, type JewelryItem } from '@/lib/types';
import { useTryOn } from '@/lib/store';
import { MirrorStage } from './MirrorStage';
import { PieceUploader } from './PieceUploader';

/**
 * The whole visitor journey, in two steps: upload your own pieces (or borrow
 * a sample look), then step in front of the mirror. Nothing here ever leaves
 * the browser — pieces live in component state until they're handed to the
 * mirror, and are gone the moment the tab closes.
 */
export function TryOnApp() {
  const step = useTryOn((s) => s.step);
  const setStep = useTryOn((s) => s.setStep);
  const wearPieces = useTryOn((s) => s.wearPieces);

  const [necklaceCutout, setNecklaceCutout] = useState<CutoutResult | null>(null);
  const [leftEarCutout, setLeftEarCutout] = useState<CutoutResult | null>(null);
  const [rightEarCutout, setRightEarCutout] = useState<CutoutResult | null>(null);

  const canContinue = Boolean(necklaceCutout || leftEarCutout || rightEarCutout);

  // The mirror is a second "screen" of one page, not a real route — but the
  // browser's own back button is still the most natural "take me back"
  // gesture, so a history entry is pushed on the way in and a physical back
  // press is treated the same as clicking the in-app back button.
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      setStep(e.state?.mirrorStep === 'studio' ? 'studio' : 'upload');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [setStep]);

  function enterMirror() {
    window.history.pushState({ mirrorStep: 'studio' }, '');
    setStep('studio');
  }

  function continueToMirror() {
    const necklace = necklaceCutout ? toNecklaceItem(necklaceCutout) : null;
    const earring = toEarringItem(leftEarCutout, rightEarCutout);
    wearPieces(necklace, earring);
    enterMirror();
  }

  function pickSample(look: SeedLook) {
    wearPieces(look.necklace, look.earring);
    enterMirror();
  }

  function backToUpload() {
    if (window.history.state?.mirrorStep === 'studio') {
      window.history.back();
    } else {
      setStep('upload');
    }
  }

  if (step === 'studio') {
    return <MirrorStage onBack={backToUpload} />;
  }

  return (
    <div className="space-y-10">
      <section className="text-center">
        <span className="hallmark">Virtual jewelry try-on</span>
        <h1 className="mx-auto mt-3 max-w-2xl font-display text-[clamp(28px,5vw,44px)] font-light leading-[1.15] text-bone">
          See your own necklace and earrings on, before you ever put them on
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-[14px] leading-relaxed text-ash">
          Upload a photo of the piece, straighten it, erase what doesn&apos;t belong — then look in the mirror. Your
          camera and your photos stay on this device; nothing is uploaded to a server, and nothing is kept once you
          leave.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <PieceUploader
          label="Necklace or pendant"
          hint="A single piece works best, laid flat or hung against a plain surface."
          cutout={necklaceCutout}
          onChange={setNecklaceCutout}
        />
        <PieceUploader
          label="Left earring"
          hint="Photograph it alone. Mirrored onto the right ear if you skip that box."
          cutout={leftEarCutout}
          onChange={setLeftEarCutout}
        />
        <PieceUploader
          label="Right earring"
          hint="Optional — add it only if it looks different from the left."
          cutout={rightEarCutout}
          onChange={setRightEarCutout}
        />
      </section>

      <section className="flex justify-center">
        <button type="button" onClick={continueToMirror} disabled={!canContinue} className="gilt-button px-8 py-3">
          Step in front of the mirror
        </button>
      </section>

      <section className="case-panel p-5">
        <div className="flex items-center justify-between">
          <span className="hallmark">No jewellery on hand?</span>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-ash">
          Borrow one of these to see how the mirror works, then come back and upload your own.
        </p>
        <ul className="mt-4 flex gap-3 overflow-x-auto pb-1">
          {SEED_LOOKS.map((look) => (
            <li key={look.id} className="shrink-0">
              <button
                type="button"
                onClick={() => pickSample(look)}
                className="group flex w-[132px] flex-col items-center gap-2 rounded-[2px] border border-white/[0.07] p-3 text-center transition-colors hover:border-white/20 hover:bg-white/[0.03]"
              >
                <div className="flex h-14 items-center justify-center gap-1.5">
                  {look.necklace && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={look.necklace.thumbUrl} alt="" className="max-h-full max-w-[70%] object-contain" />
                  )}
                  {look.earring && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={look.earring.thumbUrl} alt="" className="max-h-full max-w-[40%] object-contain" />
                  )}
                </div>
                <span className="truncate text-[12px] text-bone">{look.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function toNecklaceItem(cutout: CutoutResult): JewelryItem {
  return {
    id: `own-necklace-${nanoid(6)}`,
    kind: 'necklace',
    name: 'Your necklace',
    style: 'pendant',
    material: '',
    imageUrl: cutout.dataUrl,
    thumbUrl: cutout.thumbDataUrl,
    width: cutout.width,
    height: cutout.height,
    calibration: { ...DEFAULT_CALIBRATION },
    createdAt: new Date().toISOString(),
  };
}

/**
 * A left-only upload is mirrored onto both ears (matching the renderer's
 * existing single-piece behaviour); left and right together are worn exactly
 * as photographed, one per side, with no mirroring.
 */
function toEarringItem(left: CutoutResult | null, right: CutoutResult | null): JewelryItem | null {
  const primary = left ?? right;
  if (!primary) return null;
  const pair = left && right ? right : null;

  return {
    id: `own-earring-${nanoid(6)}`,
    kind: 'earring',
    name: 'Your earrings',
    style: 'stud',
    material: '',
    imageUrl: primary.dataUrl,
    thumbUrl: primary.thumbDataUrl,
    width: primary.width,
    height: primary.height,
    ...(pair
      ? { pairImageUrl: pair.dataUrl, pairThumbUrl: pair.thumbDataUrl, pairWidth: pair.width, pairHeight: pair.height }
      : {}),
    calibration: { ...DEFAULT_CALIBRATION },
    createdAt: new Date().toISOString(),
  };
}
