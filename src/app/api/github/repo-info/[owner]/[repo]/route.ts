import { NextResponse } from 'next/server';
import { getRepoDetails } from '@/lib/github-server';

export async function GET(
  _request: Request,
  context: { params: { owner: string; repo: string } }
) {
  try {
    const owner = decodeURIComponent(context.params.owner);
    const repo = decodeURIComponent(context.params.repo);
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

