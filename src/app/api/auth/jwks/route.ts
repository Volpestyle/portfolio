import { NextResponse } from 'next/server';
import { getAppTokenJwks } from '@/lib/auth/app-tokens';

export async function GET() {
  const jwks = await getAppTokenJwks();
  return NextResponse.json(jwks, {
    headers: {
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=300',
    },
  });
}
