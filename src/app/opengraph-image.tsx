import { ImageResponse } from 'next/og';
import { SITE_DESCRIPTION } from '@/lib/site';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px 96px',
          background: '#120D15',
          backgroundImage: 'radial-gradient(1200px 600px at 15% -10%, rgba(226,198,139,0.16), transparent 70%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <span style={{ fontSize: 72, color: '#F2EDE4', fontFamily: 'serif', fontWeight: 300 }}>Aurea</span>
          <span
            style={{
              fontSize: 18,
              color: '#9A8FA0',
              letterSpacing: 4,
              textTransform: 'uppercase',
              fontFamily: 'monospace',
            }}
          >
            Virtual fitting room
          </span>
        </div>
        <p
          style={{
            marginTop: 28,
            maxWidth: 880,
            fontSize: 30,
            lineHeight: 1.4,
            color: '#F2EDE4',
            fontFamily: 'serif',
            fontWeight: 300,
          }}
        >
          Try on your own necklace and earrings with your camera — before you buy.
        </p>
        <p style={{ marginTop: 20, maxWidth: 760, fontSize: 18, lineHeight: 1.5, color: '#9A8FA0' }}>
          {SITE_DESCRIPTION}
        </p>
      </div>
    ),
    size,
  );
}
