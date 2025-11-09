import { revalidateContent } from '@/server/revalidate';

export async function POST(req: Request) {
  const provided = req.headers.get('x-revalidate-secret');
  if (!process.env.REVALIDATE_SECRET || provided !== process.env.REVALIDATE_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const payload = await req.json().catch(() => ({ paths: [], tags: [] }));
  const paths = Array.isArray(payload.paths) ? payload.paths : [];
  const tags = Array.isArray(payload.tags) ? payload.tags : [];

  await revalidateContent({ paths, tags });
  return Response.json({ ok: true });
}

export const runtime = 'nodejs';
