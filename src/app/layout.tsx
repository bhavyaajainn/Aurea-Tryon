import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter, JetBrains_Mono } from 'next/font/google';
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from '@/lib/site';
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
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: '%s · Aurea' },
  description: SITE_DESCRIPTION,
  keywords: [
    'jewelry try on',
    'virtual necklace try on',
    'virtual earrings try on',
    'try on jewelry online',
    'necklace simulator',
    'AR jewelry try on',
    'see jewelry on before buying',
  ],
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME }],
  category: 'shopping',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Aurea — virtual jewelry try-on' }],
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ['/opengraph-image'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  icons: {
    icon: '/icon',
    apple: '/apple-icon',
  },
};

export const viewport: Viewport = {
  themeColor: '#120D15',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: 'ShoppingApplication',
  operatingSystem: 'Any (runs in a web browser)',
  browserRequirements: 'Requires a camera and a browser with WebAssembly support',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  featureList: [
    'Upload and cut out your own necklace and earring photos',
    'Straighten and erase cut-outs before wearing them',
    'Live camera try-on with face and shoulder tracking',
    'Adjustable position, size, drape, tilt, and shadow per piece',
    'Save the result as a picture — nothing is stored on a server',
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <head>
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
