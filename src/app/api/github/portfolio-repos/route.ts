import { NextRequest, NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';
import { GITHUB_CONFIG } from '@/lib/constants';
import { PortfolioConfig, PortfolioRepoConfig, PrivateRepoData } from '@/types/portfolio';

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

    // Get all public repos from GitHub
    const repos = await octokit.rest.repos.listForUser({
      username: GITHUB_CONFIG.USERNAME,
      per_page: 100,
    });

    // Create maps for quick lookup
    const portfolioRepoMap = new Map<string, PortfolioRepoConfig>(
      portfolioConfig.repositories.map((r) => [r.name, r])
    );
    
    const publicRepoMap = new Map(repos.data.map((r) => [r.name, r]));
    
    // Process repositories
    const processedRepos: (typeof repos.data[0] | PrivateRepoData)[] = [];
    
    for (const repoConfig of portfolioConfig.repositories) {
      const publicRepo = publicRepoMap.get(repoConfig.name);
      
      if (publicRepo) {
        // It's a public repo - use GitHub API data
        processedRepos.push({
          ...publicRepo,
          isStarred: repoConfig.isStarred || false,
        });
      } else if (repoConfig.isPrivate) {
        // It's a private repo - use data from config
        const privateRepoData: PrivateRepoData = {
          name: repoConfig.name,
          full_name: `${repoConfig.owner || GITHUB_CONFIG.USERNAME}/${repoConfig.name}`,
          private: true,
          owner: {
            login: repoConfig.owner || GITHUB_CONFIG.USERNAME,
          },
          description: repoConfig.description || null,
          homepage: repoConfig.homepage || repoConfig.demoUrl || null,
          language: repoConfig.language || null,
          topics: repoConfig.topics,
          created_at: repoConfig.createdAt || new Date().toISOString(),
          updated_at: repoConfig.updatedAt || new Date().toISOString(),
          isStarred: repoConfig.isStarred || false,
          readme: repoConfig.readme,
          techStack: repoConfig.techStack,
          demoUrl: repoConfig.demoUrl,
          screenshots: repoConfig.screenshots,
        };
        processedRepos.push(privateRepoData);
      }
    }
    
    // Separate starred and normal repos
    const result = {
      starred: processedRepos.filter((repo) => 
        'isStarred' in repo && repo.isStarred
      ),
      normal: processedRepos.filter((repo) => 
        !('isStarred' in repo) || !repo.isStarred
      ),
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
