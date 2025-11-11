import { NextResponse } from 'next/server';
import { getAdminPost, saveDraft } from '@/server/blog/actions';

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
}

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const post = await getAdminPost(slug);
    if (!post) {
      return NextResponse.json({ message: 'Post not found' }, { status: 404 });
    }
    return NextResponse.json(post);
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 400 });
  }
}

export async function PUT(req: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const body = await req.json();
    const version = Number(body.version);
    if (!Number.isFinite(version)) {
      return NextResponse.json({ message: 'Missing version' }, { status: 400 });
    }

    const payload = {
      title: String(body.title ?? '').trim(),
      summary: String(body.summary ?? '').trim(),
      tags: normalizeTags(body.tags),
      heroImageKey: body.heroImageKey ? String(body.heroImageKey).trim() : undefined,
      content: String(body.content ?? ''),
    };

    if (!payload.title || !payload.summary || !payload.content) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
    }

    const updated = await saveDraft({
      slug,
      body: payload.content,
      title: payload.title,
      summary: payload.summary,
      tags: payload.tags,
      heroImageKey: payload.heroImageKey,
      version,
    });

    return NextResponse.json({ slug: updated.slug, version: updated.version, post: updated });
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 400 });
  }
}
