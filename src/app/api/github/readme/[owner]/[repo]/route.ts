import { NextResponse } from 'next/server';
import { getRepoReadme } from '@/lib/github-server';
import { shouldServeFixturesForRequest } from '@/lib/test-flags';

type RouteContext = {
  params: Promise<{ owner: string; repo: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { owner: rawOwner, repo: rawRepo } = await context.params;
    const owner = decodeURIComponent(rawOwner);
    const repo = decodeURIComponent(rawRepo);

    // Return deterministic fixtures for E2E tests
    if (shouldServeFixturesForRequest(request.headers)) {
      const { TEST_README, TEST_REPO } = await import('@portfolio/test-support/fixtures');
      return NextResponse.json(
        {
          repo: TEST_REPO.name,
          owner: TEST_REPO.owner?.login ?? owner,
          readme: TEST_README,
        },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    const readme = await getRepoReadme(repo, owner);
    return NextResponse.json(
      { repo, owner, readme },
      {
        headers: {
          'Cache-Control': 's-maxage=300, stale-while-revalidate=60',
        },
      }
    );
  } catch (error) {
    console.error('Failed to load repo README', error);
    return NextResponse.json({ error: 'Unable to load README' }, { status: 500 });
  }
}
