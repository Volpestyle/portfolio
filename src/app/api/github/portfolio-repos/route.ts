import { NextResponse } from 'next/server';
import { getPortfolioRepos } from '@/lib/github-server';
import { shouldServeFixturesForRequest } from '@/lib/test-flags';

export async function GET(request: Request) {
  // Return deterministic fixtures for E2E tests
  if (shouldServeFixturesForRequest(request.headers)) {
    const { TEST_REPO } = await import('@portfolio/test-support/fixtures');
    return NextResponse.json({
      starred: [TEST_REPO],
      normal: [],
    });
  }

  try {
    const repos = await getPortfolioRepos();
    return NextResponse.json(repos, {
      headers: {
        'Cache-Control': 's-maxage=300, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    console.error('Failed to load portfolio repos', error);
    return NextResponse.json({ error: 'Unable to load repositories' }, { status: 500 });
  }
}
