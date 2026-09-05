import { listJewelry, listSets } from '@/lib/catalog';
import { Masthead } from '@/components/Masthead';
import { MirrorStage } from '@/components/MirrorStage';

export const dynamic = 'force-dynamic';

export default async function MirrorPage() {
  const [items, sets] = await Promise.all([listJewelry(), listSets()]);

  return (
    <main className="mx-auto max-w-[1180px] pb-16">
      <Masthead current="mirror" />
      <div className="px-5 sm:px-8">
        <MirrorStage initialItems={items} initialSets={sets} />
      </div>

      <footer className="mt-10 px-5 sm:px-8">
        <div className="rule" />
        <p className="mt-4 max-w-2xl text-[12px] leading-relaxed text-ash">
          The mirror measures your shoulders and jaw to work out where a necklace would sit, then keeps the piece
          pinned there as you move. Video is processed on this device and never leaves it. Sizes are an
          approximation — treat the millimetre readout as a guide, not a measurement.
        </p>
      </footer>
    </main>
  );
}
