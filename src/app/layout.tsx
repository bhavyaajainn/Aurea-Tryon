import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

// Fraunces is loaded as a variable font, so no explicit weight list: SOFT and
// WONK are what give the display face its slight warmth at large sizes.
const display = Fraunces({
  subsets: ['latin'],
  axes: ['SOFT', 'WONK', 'opsz'],
  variable: '--font-display',
  display: 'swap',
});

const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Aurea — try a necklace on',
  description:
    'See how a necklace sits before you buy it. Point a camera at yourself, pick a piece, and it hangs where it would in life.',
};

export const viewport: Viewport = {
  themeColor: '#120D15',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
