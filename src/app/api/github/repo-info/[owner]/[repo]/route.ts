import { NextRequest } from 'next/server';
import { Octokit } from '@octokit/rest';
import { GITHUB_CONFIG } from '@/lib/constants';
import { PortfolioConfig, PrivateRepoData } from '@/types/portfolio';

export async function GET(request: NextRequest, { params }: { params: Promise<{ owner: string; repo: string }> }) {
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });

  const { owner, repo } = await params;

  try {
    // First, try to get the repo from GitHub API
    const { data } = await octokit.rest.repos.get({
      owner,
      repo,
    });

    return Response.json(data);
  } catch (error: unknown) {
    // If repo not found (likely private), check if it's in our portfolio config
    if (!process.env.PORTFOLIO_GIST_ID) {
      console.error('Portfolio gist ID not configured');
      return Response.json({ error: 'Repository not found' }, { status: 404 });
    }

    try {
      // Fetch the portfolio config from gist
      const gistResponse = await octokit.rest.gists.get({
        gist_id: process.env.PORTFOLIO_GIST_ID,
      });

      const portfolioFile = gistResponse.data.files?.[GITHUB_CONFIG.PORTFOLIO_CONFIG_FILENAME];
      
      if (!portfolioFile || !portfolioFile.content) {
        return Response.json({ error: 'Repository not found' }, { status: 404 });
      }

      const portfolioConfig: PortfolioConfig = JSON.parse(portfolioFile.content);
      
      // Find the repo in the config
      const repoConfig = portfolioConfig.repositories.find(
        (r) => r.name === repo && (r.owner || GITHUB_CONFIG.USERNAME) === owner
      );

      if (!repoConfig || !repoConfig.isPrivate) {
        return Response.json({ error: 'Repository not found' }, { status: 404 });
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
    } catch (configError) {
      console.error('Error fetching repo info from config:', configError);
      return Response.json({ error: 'Repository not found' }, { status: 404 });
    }
  }
}

export const dynamic = 'force-dynamic';
