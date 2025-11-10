import { NextResponse } from 'next/server';
import { getRepoReadme } from '@/lib/github-server';
import { isE2ETestMode } from '@/lib/test-mode';
import { TEST_README, TEST_REPO } from '@/lib/test-fixtures';

export async function GET(
  request: Request,
  context: { params: { owner: string; repo: string } }
) {
  try {
    const owner = decodeURIComponent(context.params.owner);
    const repo = decodeURIComponent(context.params.repo);

    if (isE2ETestMode(request.headers)) {
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
