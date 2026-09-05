import Link from 'next/link';

/**
 * A jeweller stamps the metal, the karat, and the maker into the clasp. The
 * header borrows that: brand, then the assay mark.
 */
export function Masthead() {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 px-5 pb-5 pt-6 sm:px-8">
      <Link href="/" className="group inline-flex items-baseline gap-3">
        <span className="font-display text-[28px] font-light leading-none tracking-tight text-bone">Aurea</span>
        <span className="hallmark hidden sm:inline">Virtual fitting room</span>
      </Link>
    </header>
  );
}
