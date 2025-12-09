import { NextResponse } from 'next/server';
import { listAllGitHubRepos } from '@/lib/github-api';
import { shouldServeFixturesForRequest } from '@/lib/test-flags';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  if (shouldServeFixturesForRequest(request.headers)) {
    const { TEST_REPO } = await import('@portfolio/test-support/fixtures');

    return NextResponse.json({
      repos: [
        {
          name: TEST_REPO.name,
          owner: TEST_REPO.owner?.login ?? 'volpestyle',
          description: TEST_REPO.description,
          private: false,
          html_url: TEST_REPO.html_url,
          topics: TEST_REPO.topics,
          language: TEST_REPO.language,
          default_branch: 'main',
        },
      ],
    });
  }

  try {
    const repos = await listAllGitHubRepos();
    return NextResponse.json({ repos });
  } catch (error) {
    console.error('[api/admin/portfolio/repos] Failed to list GitHub repos', error);
    return NextResponse.json({ error: 'Failed to load repositories' }, { status: 500 });
  }
}
