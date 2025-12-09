import { NextResponse } from 'next/server';
import { listChatExports } from '@/server/chat/exports';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const exports = await listChatExports({ includeDownloadUrl: true });
    return NextResponse.json({ exports });
  } catch (err) {
    console.error('Failed to list chat exports', err);
    return NextResponse.json({ error: 'Failed to fetch chat exports.' }, { status: 500 });
  }
}
