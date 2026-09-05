import { ImageResponse } from 'next/og';

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
        <span style={{ fontSize: 96, color: '#E2C68B', fontFamily: 'serif' }}>A</span>
      </div>
    ),
    size,
  );
}
