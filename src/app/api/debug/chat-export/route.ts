'use server';

import { NextResponse } from 'next/server';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { getAdminRequestContext } from '@/server/admin/auth';
import { sanitizeExportFileName, uploadChatExport } from '@/server/chat/exports';

export const runtime = 'nodejs';

const EXPORT_DIR = path.join(process.cwd(), 'debug', 'chat-exports');
const isProd = process.env.NODE_ENV === 'production';

export async function POST(request: Request) {
  let payload: { markdown?: string; filename?: string } | null = null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  if (!payload || typeof payload.markdown !== 'string' || payload.markdown.trim().length === 0) {
    return NextResponse.json({ error: 'Missing markdown content.' }, { status: 400 });
  }

  const filename = sanitizeExportFileName(payload.filename);

  if (isProd) {
    const admin = await getAdminRequestContext();
    if (!admin.isAdmin) {
      return NextResponse.json({ error: 'Chat export requires admin access.' }, { status: 403 });
    }

    try {
      const uploadResult = await uploadChatExport(payload.markdown, {
        filename,
        exportedBy: admin.email,
        includeDownloadUrl: true,
      });

      return NextResponse.json({
        storage: 's3',
        bucket: uploadResult.bucket,
        key: uploadResult.key,
        downloadUrl: uploadResult.downloadUrl,
      });
    } catch (err) {
      console.error('Failed to upload chat export', err);
      return NextResponse.json({ error: 'Failed to upload chat export.' }, { status: 500 });
    }
  }

  const filePath = path.join(EXPORT_DIR, filename);

  try {
    await mkdir(EXPORT_DIR, { recursive: true });
    await writeFile(filePath, payload.markdown, 'utf8');
  } catch (err) {
    console.error('Failed to write chat export', err);
    return NextResponse.json({ error: 'Failed to write export file.' }, { status: 500 });
  }

  const relativePath = path.relative(process.cwd(), filePath);
  return NextResponse.json({ storage: 'filesystem', relativePath });
}
