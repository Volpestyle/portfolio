import { NextResponse } from 'next/server';
import { getDocumentContent } from '@/lib/github-server';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ pid: string; path: string[] }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { pid, path } = await context.params;
  const projectId = pid?.trim();

  if (!projectId) {
    return NextResponse.json({ error: 'Project id is required' }, { status: 400 });
  }

  if (!path?.length) {
    return NextResponse.json({ error: 'Document path is required' }, { status: 400 });
  }

  const docPath = path.join('/');
  try {
    const document = await getDocumentContent(projectId, docPath);
    const title = path[path.length - 1] ?? docPath;
    return NextResponse.json({
      document: {
        repoName: document.projectName ?? projectId,
        path: docPath,
        title,
        content: document.content,
      },
    });
  } catch (error) {
    console.error('[api/projects/[pid]/doc] Failed to load document', error);
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }
}
