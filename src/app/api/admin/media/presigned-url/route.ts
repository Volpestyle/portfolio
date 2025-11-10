import { NextResponse } from 'next/server';
import { getPresignedUpload } from '@/server/blog/actions';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const contentType = String(body.contentType ?? '').trim();
    if (!contentType) {
      return NextResponse.json({ message: 'contentType is required' }, { status: 400 });
    }

    const payload = {
      contentType,
      extension: body.ext ? String(body.ext).trim() : undefined,
    };

    const result = await getPresignedUpload(payload);
    return NextResponse.json({ ...result, expiresIn: 300 });
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 400 });
  }
}
