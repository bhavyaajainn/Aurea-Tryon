import { ImageResponse } from 'next/og';
import { LOGOMARK_FACETS_PATH, LOGOMARK_OUTLINE_PATH } from '@/lib/logomark';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#120D15',
        }}
      >
        <svg width="108" height="108" viewBox="0 0 32 32" fill="none">
          <path d={LOGOMARK_OUTLINE_PATH} stroke="#E2C68B" strokeWidth="1.4" strokeLinejoin="round" />
          <path
            d={LOGOMARK_FACETS_PATH}
            stroke="#E2C68B"
            strokeWidth="0.9"
            strokeLinejoin="round"
            opacity="0.55"
          />
        </svg>
      </div>
    ),
    size,
  );
}
