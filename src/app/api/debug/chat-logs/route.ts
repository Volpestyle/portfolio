'use server';

import { NextResponse } from 'next/server';
import { getChatDebugLogs } from '@portfolio/chat-next-api';
import { getAdminRequestContext } from '@/server/admin/auth';

export const runtime = 'nodejs';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    const admin = await getAdminRequestContext();
    if (!admin.isAdmin) {
      return NextResponse.json({ error: 'Chat logs are admin-only in production.' }, { status: 403 });
    }
  }

  return NextResponse.json({ logs: getChatDebugLogs() });
}
