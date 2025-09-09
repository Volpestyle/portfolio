import { NextRequest } from 'next/server';
import { createOctokit, getPortfolioConfig, findRepoConfig, getActualRepoName, notFoundResponse } from '@/lib/github-api';
import { GITHUB_CONFIG } from '@/lib/constants';
import { PrivateRepoData } from '@/types/portfolio';

export async function GET(request: NextRequest, { params }: { params: Promise<{ owner: string; repo: string }> }) {
  const octokit = createOctokit();
  const { owner, repo } = await params;

  // Get the actual repo name (handling private repos with public counterparts)
  const actualRepoName = await getActualRepoName(owner, repo);

  try {
    // Try to get the repo from GitHub API using the actual repo name
    const { data } = await octokit.rest.repos.get({
      owner,
      repo: actualRepoName,
    });

    return Response.json(data);
  } catch (error: unknown) {
    // If repo not found (likely private), check if it's in our portfolio config
    const portfolioConfig = await getPortfolioConfig();
    
    if (!portfolioConfig) {
      return notFoundResponse('Repository');
    }

    const repoConfig = findRepoConfig(portfolioConfig, owner, repo);

    if (!repoConfig || !repoConfig.isPrivate) {
      return notFoundResponse('Repository');
    }

    // Return private repo data
    const privateRepoData: PrivateRepoData = {
      name: repoConfig.name,
      full_name: `${owner}/${repo}`,
      private: true,
      owner: {
        login: owner,
      },
      description: repoConfig.description || null,
      homepage: repoConfig.homepage || repoConfig.demoUrl || null,
      language: repoConfig.language || null,
      topics: repoConfig.topics,
      created_at: repoConfig.createdAt || new Date().toISOString(),
      updated_at: repoConfig.updatedAt || new Date().toISOString(),
      default_branch: 'main',
      readme: repoConfig.readme,
      techStack: repoConfig.techStack,
      demoUrl: repoConfig.demoUrl,
      screenshots: repoConfig.screenshots,
    } as PrivateRepoData & { default_branch: string };

    return Response.json(privateRepoData);
  }
}

export const dynamic = 'force-dynamic';