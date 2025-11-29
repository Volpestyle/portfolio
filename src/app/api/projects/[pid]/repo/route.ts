import { NextResponse } from 'next/server';
import { getRepoByName } from '@/lib/github-server';
import { augmentRepoWithKnowledge } from '@/server/project-knowledge';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ pid: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { pid } = await context.params;
  const projectId = pid?.trim();

  if (!projectId) {
    return NextResponse.json({ error: 'Project id is required' }, { status: 400 });
  }

  try {
    const repoInfoRaw = await getRepoByName(projectId);
    const repo = await augmentRepoWithKnowledge(repoInfoRaw);
    return NextResponse.json({ repo });
  } catch (error) {
    console.error('[api/projects/[pid]/repo] Failed to load repo info', error);
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }
}
