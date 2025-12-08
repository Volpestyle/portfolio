import { NextResponse } from 'next/server';
import { getDocumentContent, getDirectoryContents } from '@/lib/github-server';

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

  // Try to fetch as file first
  try {
    const document = await getDocumentContent(projectId, docPath);
    const title = path[path.length - 1] ?? docPath;
    return NextResponse.json({
      type: 'file',
      document: {
        repoName: document.projectName ?? projectId,
        path: docPath,
        title,
        content: document.content,
      },
    });
  } catch {
    // File not found, try as directory
  }

  // Try to fetch as directory
  try {
    const entries = await getDirectoryContents(projectId, docPath);
    return NextResponse.json({
      type: 'directory',
      directory: {
        repoName: projectId,
        path: docPath,
        entries,
      },
    });
  } catch (error) {
    console.error('[api/projects/[pid]/doc] Failed to load document or directory', error);
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }
}
