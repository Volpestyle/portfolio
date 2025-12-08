import { NextResponse } from 'next/server';
import { deletePost } from '@/server/blog/actions';

type RouteContext = { params: Promise<{ slug: string }> };

export async function POST(request: Request, context: RouteContext) {
  void request;
  try {
    const { slug } = await context.params;
    await deletePost({ slug });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 400 });
  }
}
