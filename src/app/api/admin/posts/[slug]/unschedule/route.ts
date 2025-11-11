import { NextResponse } from 'next/server';
import { unschedulePost } from '@/server/blog/actions';

type RouteContext = { params: Promise<{ slug: string }> };

export async function POST(req: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const body = await req.json().catch(() => ({}));
    const version = Number(body.version);

    if (!Number.isFinite(version)) {
      return NextResponse.json({ message: 'Missing version' }, { status: 400 });
    }

    const payload = {
      slug,
      version,
    };

    const updated = await unschedulePost(payload);
    return NextResponse.json({ post: updated });
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 400 });
  }
}
