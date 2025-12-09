import { NextResponse } from 'next/server';
import { saveProjects, getAllProjects } from '@/server/portfolio/store';
import { revalidateContent } from '@/server/revalidate';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const projects = await getAllProjects();
    return NextResponse.json({ projects });
  } catch (error) {
    console.error('[api/admin/projects] Failed to load projects', error);
    return NextResponse.json({ error: 'Failed to load projects' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const projects = Array.isArray((body as any).projects) ? (body as any).projects : [];
    const saved = await saveProjects(projects);

    await revalidateContent({ tags: ['github-repos'], paths: ['/projects'] });

    return NextResponse.json({ projects: saved });
  } catch (error) {
    console.error('[api/admin/projects] Failed to save projects', error);
    return NextResponse.json({ error: 'Failed to save projects' }, { status: 500 });
  }
}
