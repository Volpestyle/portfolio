import { NextRequest, NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';
import { GITHUB_CONFIG } from '@/lib/constants';

// Types for portfolio configuration
interface PortfolioRepo {
  name: string;
  isStarred?: boolean;
}

interface PortfolioConfig {
  repositories: PortfolioRepo[];
}

class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

class GistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GistError';
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Validate environment variables
  if (!process.env.GITHUB_TOKEN) {
    return NextResponse.json({ error: 'GitHub token is not configured' }, { status: 500 });
  }

  if (!process.env.PORTFOLIO_GIST_ID) {
    return NextResponse.json({ error: 'Portfolio gist ID is not configured' }, { status: 500 });
  }

  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });

  try {
    // Fetch gist containing portfolio config
    const gistResponse = await octokit.rest.gists.get({
      gist_id: process.env.PORTFOLIO_GIST_ID,
    });

    const portfolioFile = gistResponse.data.files?.[GITHUB_CONFIG.PORTFOLIO_CONFIG_FILENAME];

    if (!portfolioFile || !portfolioFile.content) {
      throw new GistError('Portfolio configuration file not found in gist');
    }

    let portfolioConfig: PortfolioConfig;
    try {
      portfolioConfig = JSON.parse(portfolioFile.content);
    } catch (e) {
      throw new ConfigError('Invalid JSON in portfolio configuration');
    }

    if (!Array.isArray(portfolioConfig.repositories)) {
      throw new ConfigError('Invalid portfolio configuration: repositories must be an array');
    }

    // Get all repos
    const repos = await octokit.rest.repos.listForUser({
      username: GITHUB_CONFIG.USERNAME,
      per_page: 100,
    });

    // Create sets for quick lookup
    const portfolioRepoNames = new Set(portfolioConfig.repositories.map((r) => r.name));
    const starredRepoNames = new Set(portfolioConfig.repositories.filter((r) => r.isStarred).map((r) => r.name));

    const result = {
      starred: repos.data
        .filter((repo) => starredRepoNames.has(repo.name))
        .map((repo) => ({
          ...repo,
          isStarred: true,
        })),
      normal: repos.data
        .filter((repo) => portfolioRepoNames.has(repo.name) && !starredRepoNames.has(repo.name))
        .map((repo) => ({
          ...repo,
          isStarred: false,
        })),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching portfolio repos:', error);

    if (error instanceof GistError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof ConfigError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON format in configuration' }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to fetch repos' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
