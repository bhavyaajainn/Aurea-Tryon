import Link from 'next/link';

/**
 * A jeweller stamps the metal, the karat, and the maker into the clasp. The
 * header borrows that: brand, then the assay marks, then the way through.
 */
export function Masthead({ current }: { current: 'mirror' | 'workshop' }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 px-5 pb-5 pt-6 sm:px-8">
      <div>
        <Link href="/" className="group inline-flex items-baseline gap-3">
          <span className="font-display text-[28px] font-light leading-none tracking-tight text-bone">
            Aurea
          </span>
          <span className="hallmark hidden sm:inline">Fitting room</span>
        </Link>
        <p className="mt-2 max-w-md text-[13px] leading-relaxed text-ash">
          {current === 'mirror'
            ? 'Pick a piece from the tray. It follows your neck until you look away.'
            : 'Drop in a product photo. The background comes off, the piece stays.'}
        </p>
      </div>

      <nav className="flex items-center gap-1 rounded-[2px] border border-white/10 p-1">
        <Tab href="/" label="Mirror" active={current === 'mirror'} />
        <Tab href="/admin" label="Workshop" active={current === 'workshop'} />
      </nav>
    </header>
  );
}

function Tab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={
        active
          ? 'rounded-[1px] bg-champagne/15 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-champagne'
          : 'rounded-[1px] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ash transition-colors hover:text-bone'
      }
    >
      {label}
    </Link>
  );
}
