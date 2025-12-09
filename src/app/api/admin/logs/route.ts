import { NextRequest, NextResponse } from 'next/server';
import { listChatLogMetadata } from '@/server/admin/logs-store';
import { uploadChatLog } from '@/server/admin/log-storage';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tag = searchParams.get('tag') ?? undefined;
  const sessionId = searchParams.get('sessionId') ?? undefined;
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;

  try {
    const logs = await listChatLogMetadata({ tag, sessionId, limit });
    return NextResponse.json({ logs });
  } catch (err) {
    console.error('Failed to list chat log metadata', err);
    return NextResponse.json({ error: 'Failed to fetch chat logs.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: { filename?: string; sessionId?: string; tags?: unknown; log?: unknown; messages?: unknown[] } | null = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || (body.log === undefined && body.messages === undefined)) {
    return NextResponse.json({ error: 'Missing log content (log or messages required)' }, { status: 400 });
  }

  const tags =
    Array.isArray(body.tags) && body.tags.every((t) => typeof t === 'string')
      ? (body.tags as string[])
      : undefined;

  const sessionId = typeof body.sessionId === 'string' && body.sessionId.trim() ? body.sessionId.trim() : undefined;
  const messages = Array.isArray(body.messages) ? body.messages : undefined;
  const logBody =
    body.log !== undefined
      ? body.log
      : {
          sessionId: sessionId ?? 'unknown',
          messages,
        };

  const messageCount =
    Array.isArray(messages)
      ? messages.length
      : typeof logBody === 'object' && logBody !== null && Array.isArray((logBody as { messages?: unknown[] }).messages)
        ? (logBody as { messages?: unknown[] }).messages?.length
        : undefined;

  try {
    const result = await uploadChatLog({
      filename: body.filename,
      sessionId,
      tags,
      messageCount,
      body: logBody,
    });
    return NextResponse.json({ location: result });
  } catch (err) {
    console.error('Failed to upload chat log', err);
    return NextResponse.json({ error: 'Failed to save chat log.' }, { status: 500 });
  }
}
