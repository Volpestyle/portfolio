import { NextResponse } from 'next/server';
import { getDocumentContent } from '@/lib/github-server';

export async function GET(
  _request: Request,
  context: { params: Promise<{ owner: string; repo: string; path: string[] }> }
) {
  try {
    const params = await context.params;
    const owner = decodeURIComponent(params.owner);
    const repo = decodeURIComponent(params.repo);
    const pathSegments = params.path ?? [];
    const docPath = pathSegments.map(decodeURIComponent).join('/');

    if (!docPath) {
      return NextResponse.json({ error: 'Document path is required' }, { status: 400 });
    }

    const document = await getDocumentContent(repo, docPath, owner);
    return NextResponse.json(
      {
        repo,
        owner,
        path: docPath,
        ...document,
      },
      {
        headers: {
          'Cache-Control': 's-maxage=300, stale-while-revalidate=60',
        },
      }
    );
  } catch (error) {
    console.error('Failed to load document content', error);
    return NextResponse.json({ error: 'Unable to load document' }, { status: 500 });
  }
}

