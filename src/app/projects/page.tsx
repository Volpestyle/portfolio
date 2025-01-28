import { Octokit } from '@octokit/rest';
import { GITHUB_CONFIG } from '@/lib/constants';
import { ProjectCard } from './ProjectCard';

function formatDate(dateString: string): string {
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  return new Date(dateString).toLocaleDateString(undefined, options);
}

interface GistContent {
  repositories: {
    name: string;
    isStarred: boolean;
  }[];
}

interface GistFile {
  filename: string;
  content: string;
}

interface RepoData {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  pushed_at: string;
  html_url: string;
  isStarred: boolean;
}

async function getRepositories(): Promise<{ starred: RepoData[]; normal: RepoData[] }> {
  console.log('Environment check:', {
    GITHUB_TOKEN_length: process.env.GITHUB_TOKEN?.length || 0,
    PORTFOLIO_GIST_ID_length: process.env.PORTFOLIO_GIST_ID?.length || 0,
    NODE_ENV: process.env.NODE_ENV,
  });

  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });

  try {
    console.log('Using token:', !!process.env.GITHUB_TOKEN);
    console.log('Using gist ID:', !!process.env.PORTFOLIO_GIST_ID);

    if (!process.env.GITHUB_TOKEN || !process.env.PORTFOLIO_GIST_ID) {
      throw new Error('Missing required environment variables');
    }

    // First fetch the gist containing portfolio config
    const gistResponse = await octokit.rest.gists.get({
      gist_id: process.env.PORTFOLIO_GIST_ID,
    });

    // Log successful gist fetch
    console.log('Gist fetched successfully');

    // Parse the gist content with type safety
    const portfolioFile = gistResponse.data.files?.[GITHUB_CONFIG.PORTFOLIO_CONFIG_FILENAME] as GistFile | undefined;
    const portfolioConfig: GistContent = JSON.parse(portfolioFile?.content || '{"repositories":[]}');

    // Get all repos
    const repos = await octokit.rest.repos.listForUser({
      username: GITHUB_CONFIG.USERNAME,
      per_page: 100,
    });

    console.log('Repos fetched successfully:', repos.data.length);

    // Create sets for quick lookup
    const portfolioRepoNames = new Set(portfolioConfig.repositories.map((r) => r.name));
    const starredRepoNames = new Set(portfolioConfig.repositories.filter((r) => r.isStarred).map((r) => r.name));

    // Add logging for the filtered repos
    console.log('Portfolio repos found:', portfolioRepoNames.size);
    console.log('Starred repos found:', starredRepoNames.size);

    // Filter and categorize repos
    const result = {
      starred: repos.data
        .filter((repo) => starredRepoNames.has(repo.name))
        .map((repo) => ({
          ...repo,
          isStarred: true,
          created_at: repo.created_at || '',
          pushed_at: repo.pushed_at || '',
        })),
      normal: repos.data
        .filter((repo) => portfolioRepoNames.has(repo.name) && !starredRepoNames.has(repo.name))
        .map((repo) => ({
          ...repo,
          isStarred: false,
          created_at: repo.created_at || '',
          pushed_at: repo.pushed_at || '',
        })),
    };

    console.log('Final repos count:', {
      starred: result.starred.length,
      normal: result.normal.length,
    });

    return result;
  } catch (error) {
    // Detailed error logging
    console.error('Error in getRepositories:', {
      message: (error as Error).message,
      status: (error as any).status,
      response: (error as any).response?.data,
    });
    throw error;
  }
}

export default async function Projects() {
  const { starred, normal } = await getRepositories();
  const repos = [...starred, ...normal];

  if (!repos.length) {
    return (
      <div className="text-center">
        <h1 className="mb-6 text-3xl font-bold">My Code</h1>
        <p className="text-gray-400">Unable to load projects at the moment. Please try again later.</p>
      </div>
    );
  }

  return (
    <>
      <h1 className="mb-6 text-3xl font-bold">My Code</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {repos.map((repo) => (
          <ProjectCard key={repo.id} repo={repo} />
        ))}
      </div>
    </>
  );
}

export const dynamic = 'force-dynamic';
