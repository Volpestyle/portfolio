import { NextRequest, NextResponse } from 'next/server';
import { getChatLogMetadata, updateChatLogMetadata } from '@/server/admin/logs-store';
import { fetchChatLogBody } from '@/server/admin/log-storage';

export const runtime = 'nodejs';

type RouteParams = {
  params: Promise<{ filename: string }>;
};

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { filename } = await params;

  try {
    const log = await getChatLogMetadata(filename);
    if (!log) {
      return NextResponse.json({ error: 'Log not found' }, { status: 404 });
    }

    const body = log.s3Key ? await fetchChatLogBody(log.s3Key) : null;
    return NextResponse.json({ log, body });
  } catch (err) {
    console.error('Failed to get chat log metadata', err);
    return NextResponse.json({ error: 'Failed to fetch log.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { filename } = await params;

  let body: { tags?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body.tags !== undefined && !Array.isArray(body.tags)) {
    return NextResponse.json({ error: 'tags must be an array' }, { status: 400 });
  }

  if (body.tags && !body.tags.every((t) => typeof t === 'string')) {
    return NextResponse.json({ error: 'tags must be an array of strings' }, { status: 400 });
  }

  try {
    const updated = await updateChatLogMetadata(filename, { tags: body.tags });
    if (!updated) {
      return NextResponse.json({ error: 'Log not found' }, { status: 404 });
    }
    return NextResponse.json({ log: updated });
  } catch (err) {
    console.error('Failed to update chat log metadata', err);
    return NextResponse.json({ error: 'Failed to update log.' }, { status: 500 });
  }
}
