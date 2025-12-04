import { NextResponse } from 'next/server';
import type { BlogPostStatus } from '@/types/blog';
import { createPost, saveDraft, listAdminPosts } from '@/server/blog/actions';

function parseTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') ?? undefined;
  const statusParam = searchParams.get('status') ?? undefined;

  let status: BlogPostStatus | undefined;
  if (statusParam && ['draft', 'scheduled', 'published', 'archived'].includes(statusParam)) {
    status = statusParam as BlogPostStatus;
  }

  try {
    const posts = await listAdminPosts({ status, search });
    return NextResponse.json({ posts });
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const payload = {
      title: String(body.title ?? '').trim(),
      slug: String(body.slug ?? '').trim(),
      summary: String(body.summary ?? '').trim(),
      tags: parseTags(body.tags),
      heroImageKey: body.heroImageKey ? String(body.heroImageKey).trim() : undefined,
      content: String(body.content ?? ''),
    };

    if (!payload.title || !payload.slug || !payload.summary || !payload.content) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
    }

    const created = await createPost({
      title: payload.title,
      slug: payload.slug,
      summary: payload.summary,
      tags: payload.tags,
      heroImageKey: payload.heroImageKey,
    });

    const saved = await saveDraft({
      slug: payload.slug,
      body: payload.content,
      title: payload.title,
      summary: payload.summary,
      tags: payload.tags,
      heroImageKey: payload.heroImageKey,
      version: created.version,
    });

    return NextResponse.json({ slug: saved.slug, version: saved.version, post: saved });
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 400 });
  }
}
