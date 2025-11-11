import { NextResponse } from 'next/server';
import { getRepoDetails } from '@/lib/github-server';

type RouteContext = {
  params: Promise<{ owner: string; repo: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { owner: rawOwner, repo: rawRepo } = await context.params;
    const owner = decodeURIComponent(rawOwner);
    const repo = decodeURIComponent(rawRepo);
    const details = await getRepoDetails(repo, owner);
    return NextResponse.json(details, {
      headers: {
        'Cache-Control': 's-maxage=300, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    console.error('Failed to load repo info', error);
    return NextResponse.json({ error: 'Unable to load repository info' }, { status: 500 });
  }
}
