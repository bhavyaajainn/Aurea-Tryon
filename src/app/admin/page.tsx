import { listJewelry, listSets } from '@/lib/catalog';
import { Masthead } from '@/components/Masthead';
import { Workshop } from '@/components/Workshop';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Workshop — Aurea' };

export default async function WorkshopPage() {
  const [items, sets] = await Promise.all([listJewelry(), listSets()]);

  return (
    <main className="mx-auto max-w-[1180px] pb-16">
      <Masthead current="workshop" />
      <div className="px-5 sm:px-8">
        <Workshop initialItems={items} initialSets={sets} />
      </div>

      <footer className="mt-10 px-5 sm:px-8">
        <div className="rule" />
        <p className="mt-4 max-w-2xl text-[12px] leading-relaxed text-ash">
          Cutting happens in this browser tab, so photos are never uploaded until you add the piece — and then only
          the finished cut-out is sent. The first cut of a session downloads the matting model, which takes a moment.
        </p>
      </footer>
    </main>
  );
}
