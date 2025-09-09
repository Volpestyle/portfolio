import { NextRequest } from 'next/server';
import { getActualRepoName } from '@/lib/github-api';

export async function GET(request: NextRequest, { params }: { params: Promise<{ owner: string; repo: string }> }) {
  const { owner, repo } = await params;
  
  const publicRepoName = await getActualRepoName(owner, repo);
  
  return Response.json({ publicRepoName });
}

export const dynamic = 'force-dynamic';