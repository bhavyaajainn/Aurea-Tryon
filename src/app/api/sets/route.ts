import { NextResponse } from 'next/server';
import { checkAdminToken, createSet, listSets } from '@/lib/catalog';

export const dynamic = 'force-dynamic';

export async function GET() {
  const sets = await listSets();
  return NextResponse.json({ sets });
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
  const necklaceId = typeof b.necklaceId === 'string' && b.necklaceId ? b.necklaceId : null;
  const earringId = typeof b.earringId === 'string' && b.earringId ? b.earringId : null;

  try {
    const set = await createSet({ name: String(b.name ?? ''), necklaceId, earringId });
    return NextResponse.json({ set }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save the set.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
