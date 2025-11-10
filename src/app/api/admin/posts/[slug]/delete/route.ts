import { NextResponse } from 'next/server';
import { deletePost } from '@/server/blog/actions';

type RouteContext = { params: { slug: string } };

export async function POST(_req: Request, context: RouteContext) {
  try {
    const { slug } = context.params;
    await deletePost({ slug });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 400 });
  }
}
