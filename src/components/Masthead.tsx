import Link from 'next/link';
import { LOGOMARK_FACETS_PATH, LOGOMARK_OUTLINE_PATH } from '@/lib/logomark';

/**
 * A jeweller stamps the metal, the karat, and the maker into the clasp. The
 * header borrows that: brand, then the assay mark.
 */
export function Masthead() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 px-5 pb-5 pt-6 sm:px-8">
      <Link href="/" className="group inline-flex items-center gap-2.5 sm:gap-3">
        <Logomark className="h-7 w-7 shrink-0 text-champagne transition-transform group-hover:scale-105 sm:h-8 sm:w-8" />
        <span className="font-display text-[24px] font-light leading-none tracking-tight text-bone sm:text-[28px]">
          Aurea
        </span>
        <span className="hallmark hidden sm:inline">Virtual fitting room</span>
      </Link>
    </header>
  );
}

/**
 * The brand mark: a faceted stone seen from above, drawn in a single hairline
 * weight so it reads clean at favicon size and at header size alike.
 */
function Logomark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <path d={LOGOMARK_OUTLINE_PATH} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path
        d={LOGOMARK_FACETS_PATH}
        stroke="currentColor"
        strokeWidth="0.9"
        strokeLinejoin="round"
        opacity="0.55"
      />
    </svg>
  );
}
