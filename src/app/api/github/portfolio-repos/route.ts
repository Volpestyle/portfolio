import { NextResponse } from 'next/server';
import { getPortfolioRepos } from '@/lib/github-server';

export async function GET() {
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

