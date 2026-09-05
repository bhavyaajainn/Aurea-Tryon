import { NextResponse } from 'next/server';
import { checkAdminToken, deleteSet } from '@/lib/catalog';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, { params }: Params) {
  const denial = checkAdminToken(request.headers.get('authorization'));
  if (denial) return NextResponse.json({ error: denial }, { status: 401 });

  const { id } = await params;
  const removed = await deleteSet(id);
  if (!removed) {
    return NextResponse.json(
      { error: 'Only sets you created can be removed. Sample sets are read-only.' },
      { status: 404 },
    );
  }
  return new NextResponse(null, { status: 204 });
}
