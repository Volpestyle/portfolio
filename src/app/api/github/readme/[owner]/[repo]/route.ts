import { NextResponse } from 'next/server';
import { getRepoReadme } from '@/lib/github-server';

export async function GET(
  _request: Request,
  context: { params: Promise<{ owner: string; repo: string }> }
) {
  try {
    const params = await context.params;
    const owner = decodeURIComponent(params.owner);
    const repo = decodeURIComponent(params.repo);
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

