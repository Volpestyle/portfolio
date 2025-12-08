'use server';

import { NextResponse } from 'next/server';
import { getAdminRequestContext } from '@/server/admin/auth';
import { listChatExports } from '@/server/chat/exports';

export const runtime = 'nodejs';

export async function GET() {
  const admin = await getAdminRequestContext();
  if (!admin.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const exports = await listChatExports({ includeDownloadUrl: true });
    return NextResponse.json({ exports });
  } catch (err) {
    console.error('Failed to list chat exports', err);
    return NextResponse.json({ error: 'Failed to fetch chat exports.' }, { status: 500 });
  }
}
