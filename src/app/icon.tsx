import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
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
          borderRadius: 6,
        }}
      >
        <span style={{ fontSize: 20, color: '#E2C68B', fontFamily: 'serif' }}>A</span>
      </div>
    ),
    size,
  );
}
