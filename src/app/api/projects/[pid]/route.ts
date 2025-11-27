import { NextResponse } from 'next/server';
import { getChatDataProviders } from '@/server/chat/dataProviders';
import { getRepoByName, getRepoReadme } from '@/lib/github-server';
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
    const { projectDetailProvider } = getChatDataProviders();
    const [project, repoInfoRaw, readme] = await Promise.all([
      projectDetailProvider.getProjectDetail(projectId),
      getRepoByName(projectId),
      getRepoReadme(projectId),
    ]);
    const repo = await augmentRepoWithKnowledge(repoInfoRaw);
    return NextResponse.json({ project, repo, readme });
  } catch (error) {
    console.error('[api/projects/[pid]] Failed to load project detail', error);
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }
}
