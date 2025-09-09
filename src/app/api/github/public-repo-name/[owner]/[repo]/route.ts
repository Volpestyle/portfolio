import { NextRequest } from 'next/server';
import { Octokit } from '@octokit/rest';
import { GITHUB_CONFIG } from '@/lib/constants';
import { PortfolioConfig } from '@/types/portfolio';

export async function GET(request: NextRequest, { params }: { params: Promise<{ owner: string; repo: string }> }) {
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });
  const { owner, repo } = await params;

  if (!process.env.PORTFOLIO_GIST_ID) {
    // Default: append 'public' to the repo name
    return Response.json({ publicRepoName: `${repo}public` });
  }

  try {
    const gistResponse = await octokit.rest.gists.get({
      gist_id: process.env.PORTFOLIO_GIST_ID,
    });

    const portfolioFile = gistResponse.data.files?.[GITHUB_CONFIG.PORTFOLIO_CONFIG_FILENAME];

    if (!portfolioFile || !portfolioFile.content) {
      // Default: append 'public' to the repo name
      return Response.json({ publicRepoName: `${repo}public` });
    }

    const portfolioConfig: PortfolioConfig = JSON.parse(portfolioFile.content);

    // Find the repo in the config
    const repoConfig = portfolioConfig.repositories.find(
      (r) => r.name === repo && (r.owner || GITHUB_CONFIG.USERNAME) === owner
    );

    if (!repoConfig?.isPrivate) {
      // If not private, return the original repo name
      return Response.json({ publicRepoName: repo });
    }

    // If this repo has a publicRepo override, use that
    if (repoConfig.publicRepo) {
      return Response.json({ publicRepoName: repoConfig.publicRepo });
    }

    // Default: append 'public' to the repo name
    return Response.json({ publicRepoName: `${repo}public` });
  } catch (error) {
    console.error('Error fetching portfolio config:', error);
    // Default: append 'public' to the repo name
    return Response.json({ publicRepoName: `${repo}public` });
  }
}

export const dynamic = 'force-dynamic';
