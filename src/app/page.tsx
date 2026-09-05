import { Masthead } from '@/components/Masthead';
import { TryOnApp } from '@/components/TryOnApp';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-[1180px] pb-16">
      <Masthead />
      <div className="px-5 sm:px-8">
        <TryOnApp />
      </div>

      <footer className="mt-10 px-5 sm:px-8">
        <div className="rule" />
        <p className="mt-4 max-w-2xl text-[12px] leading-relaxed text-ash">
          Aurea runs entirely in this browser tab. Your jewellery photos and your camera feed are never uploaded to
          a server and never written to local storage — they exist only for this session. The mirror measures your
          shoulders and jaw to work out where a piece would sit, then keeps it pinned there as you move. Sizes are an
          approximation — treat the millimetre readout as a guide, not a measurement.
        </p>
      </footer>
    </main>
  );
}
