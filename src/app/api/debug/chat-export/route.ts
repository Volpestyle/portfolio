'use server';

import { NextResponse } from 'next/server';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const EXPORT_DIR = path.join(process.cwd(), 'debug', 'chat-exports');

function sanitizeFileName(filename?: string) {
  const fallback = `chat-debug-${new Date().toISOString().replace(/[:]/g, '-')}.md`;
  const targetName = typeof filename === 'string' && filename.trim() ? filename.trim() : fallback;
  const safeName = targetName.replace(/[^a-zA-Z0-9-_.]/g, '_');
  return safeName.endsWith('.md') ? safeName : `${safeName}.md`;
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Chat export is disabled in production.' }, { status: 403 });
  }

  let payload: { markdown?: string; filename?: string } | null = null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  if (!payload || typeof payload.markdown !== 'string' || payload.markdown.trim().length === 0) {
    return NextResponse.json({ error: 'Missing markdown content.' }, { status: 400 });
  }

  const filename = sanitizeFileName(payload.filename);
  const filePath = path.join(EXPORT_DIR, filename);

  try {
    await mkdir(EXPORT_DIR, { recursive: true });
    await writeFile(filePath, payload.markdown, 'utf8');
  } catch (err) {
    console.error('Failed to write chat export', err);
    return NextResponse.json({ error: 'Failed to write export file.' }, { status: 500 });
  }

  const relativePath = path.relative(process.cwd(), filePath);
  return NextResponse.json({ relativePath });
}
