import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-5 px-6 text-center">
      <p className="hallmark">404</p>
      <h1 className="font-display text-[34px] font-light leading-tight text-bone">
        Nothing on this shelf
      </h1>
      <p className="text-[13px] leading-relaxed text-ash">
        The page you asked for is not part of the fitting room.
      </p>
      <Link href="/" className="gilt-button">
        Back to the mirror
      </Link>
    </main>
  );
}
