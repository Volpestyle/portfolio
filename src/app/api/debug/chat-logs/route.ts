'use server';

import { NextResponse } from 'next/server';
import { getChatDebugLogs } from '@portfolio/chat-next-api';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Chat logs are disabled in production.' }, { status: 403 });
  }

  return NextResponse.json({ logs: getChatDebugLogs() });
}
