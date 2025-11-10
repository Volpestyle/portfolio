import { NextResponse } from 'next/server';
import { schedulePost } from '@/server/blog/actions';

type RouteContext = {
  params: { slug: string };
};

export async function POST(req: Request, context: RouteContext) {
  try {
    const { slug } = context.params;
    const body = await req.json().catch(() => ({}));
    const version = Number(body.version);
    const scheduledFor = body.scheduledFor;

    if (!Number.isFinite(version)) {
      return NextResponse.json({ message: 'Missing version' }, { status: 400 });
    }

    if (!scheduledFor || typeof scheduledFor !== 'string') {
      return NextResponse.json({ message: 'Missing scheduledFor' }, { status: 400 });
    }

    const payload = {
      slug,
      version,
      scheduledFor,
    };

    const updated = await schedulePost(payload);
    return NextResponse.json({ post: updated });
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 400 });
  }
}
