import { NextResponse } from 'next/server';
import { getDocumentContent } from '@/lib/github-server';
import { shouldServeFixturesForRequest } from '@/lib/test-flags';

type RouteParams = {
  owner: string;
  repo: string;
  path?: string[];
};

export async function GET(request: Request, context: { params: Promise<RouteParams> }) {
  try {
    const params = await context.params;
    const owner = decodeURIComponent(params.owner);
    const repo = decodeURIComponent(params.repo);
    const pathSegments = params.path ?? [];
    const docPath = pathSegments.map(decodeURIComponent).join('/');

    if (!docPath) {
      return NextResponse.json({ error: 'Document path is required' }, { status: 400 });
    }

    // Return deterministic fixtures for E2E tests
    if (shouldServeFixturesForRequest(request.headers)) {
      const { TEST_DOC_CONTENT, TEST_REPO } = await import('@portfolio/test-support/fixtures');
      return NextResponse.json(
        {
          repo,
          owner,
          path: docPath,
          content: TEST_DOC_CONTENT,
          projectName: TEST_REPO.name,
        },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
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
