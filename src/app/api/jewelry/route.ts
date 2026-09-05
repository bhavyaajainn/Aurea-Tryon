import { NextResponse } from 'next/server';
import { checkAdminToken, createJewelry, listJewelry } from '@/lib/catalog';
import { EARRING_STYLES, NECKLACE_STYLES, type EarringStyle, type NecklaceStyle, type PieceKind } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Max accepted cut-out, base64-inflated. Keeps a bad upload from filling the disk. */
const MAX_PNG_CHARS = 12 * 1024 * 1024;

export async function GET() {
  const items = await listJewelry();
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const denial = checkAdminToken(request.headers.get('authorization'));
  if (denial) return NextResponse.json({ error: denial }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const pngDataUrl = typeof b.pngDataUrl === 'string' ? b.pngDataUrl : '';
  const thumbDataUrl = typeof b.thumbDataUrl === 'string' ? b.thumbDataUrl : '';

  if (!pngDataUrl.startsWith('data:image/png;base64,')) {
    return NextResponse.json({ error: 'The cut-out must be a base64 PNG data URL.' }, { status: 400 });
  }
  if (pngDataUrl.length > MAX_PNG_CHARS) {
    return NextResponse.json({ error: 'That cut-out is larger than 12 MB. Downscale it and try again.' }, { status: 413 });
  }

  const pairPngDataUrl = typeof b.pairPngDataUrl === 'string' ? b.pairPngDataUrl : undefined;
  const pairThumbDataUrl = typeof b.pairThumbDataUrl === 'string' ? b.pairThumbDataUrl : undefined;
  if (pairPngDataUrl) {
    if (!pairPngDataUrl.startsWith('data:image/png;base64,')) {
      return NextResponse.json({ error: 'The paired cut-out must be a base64 PNG data URL.' }, { status: 400 });
    }
    if (pairPngDataUrl.length > MAX_PNG_CHARS) {
      return NextResponse.json(
        { error: 'That paired cut-out is larger than 12 MB. Downscale it and try again.' },
        { status: 413 },
      );
    }
  }

  const kind: PieceKind = b.kind === 'earring' ? 'earring' : 'necklace';
  const styles: string[] = kind === 'earring' ? EARRING_STYLES : NECKLACE_STYLES;
  const style = (styles.includes(b.style as string) ? b.style : styles[0]) as NecklaceStyle | EarringStyle;
  const width = Number(b.width);
  const height = Number(b.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return NextResponse.json({ error: 'Width and height must be positive numbers.' }, { status: 400 });
  }
  const pairWidth = Number(b.pairWidth);
  const pairHeight = Number(b.pairHeight);

  try {
    const item = await createJewelry({
      kind,
      name: String(b.name ?? ''),
      style,
      material: String(b.material ?? ''),
      pngDataUrl,
      thumbDataUrl: thumbDataUrl || pngDataUrl,
      width,
      height,
      ...(pairPngDataUrl
        ? {
            pairPngDataUrl,
            pairThumbDataUrl: pairThumbDataUrl || pairPngDataUrl,
            pairWidth: Number.isFinite(pairWidth) ? pairWidth : width,
            pairHeight: Number.isFinite(pairHeight) ? pairHeight : height,
          }
        : {}),
      calibration: (b.calibration as Record<string, number> | undefined) ?? undefined,
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save the piece.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
