import { NextResponse } from 'next/server';
import { checkAdminToken, deleteJewelry, getJewelry, updateCalibration, updateJewelryKind } from '@/lib/catalog';
import {
  DEFAULT_CALIBRATION,
  EARRING_STYLES,
  NECKLACE_STYLES,
  type Calibration,
  type EarringStyle,
  type NecklaceStyle,
  type PieceKind,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const item = await getJewelry(id);
  if (!item) return NextResponse.json({ error: 'No piece with that id.' }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(request: Request, { params }: Params) {
  const denial = checkAdminToken(request.headers.get('authorization'));
  if (denial) return NextResponse.json({ error: denial }, { status: 401 });

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    calibration?: Partial<Calibration>;
    kind?: string;
    style?: string;
  };

  // Re-tagging is a separate concern from calibration: it must not touch a
  // piece's saved fit, so it takes its own branch rather than folding into
  // the calibration merge below.
  if (body.kind) {
    const kind: PieceKind = body.kind === 'earring' ? 'earring' : 'necklace';
    const styles: string[] = kind === 'earring' ? EARRING_STYLES : NECKLACE_STYLES;
    const style = (styles.includes(body.style ?? '') ? body.style : styles[0]) as NecklaceStyle | EarringStyle;

    const item = await updateJewelryKind(id, kind, style);
    if (!item) {
      return NextResponse.json(
        { error: 'Only uploaded pieces can be recategorised. Sample pieces are read-only.' },
        { status: 404 },
      );
    }
    return NextResponse.json({ item });
  }

  const merged: Calibration = { ...DEFAULT_CALIBRATION, ...(body.calibration ?? {}) };
  const item = await updateCalibration(id, merged);
  if (!item) {
    return NextResponse.json(
      { error: 'Only uploaded pieces can be recalibrated. Sample pieces are read-only.' },
      { status: 404 },
    );
  }
  return NextResponse.json({ item });
}

export async function DELETE(request: Request, { params }: Params) {
  const denial = checkAdminToken(request.headers.get('authorization'));
  if (denial) return NextResponse.json({ error: denial }, { status: 401 });

  const { id } = await params;
  const removed = await deleteJewelry(id);
  if (!removed) {
    return NextResponse.json(
      { error: 'Only uploaded pieces can be removed. Sample pieces are read-only.' },
      { status: 404 },
    );
  }
  return new NextResponse(null, { status: 204 });
}
