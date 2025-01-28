import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { StarIcon } from '@/lib/svgs';
import { Octokit } from '@octokit/rest';
import { GITHUB_CONFIG } from '@/lib/constants';

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

async function getRepositories() {
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });

  // First fetch the gist containing portfolio config
  const gistResponse = await octokit.rest.gists.get({
    gist_id: process.env.PORTFOLIO_GIST_ID!,
  });

  // Parse the gist content with type safety
  const portfolioFile = gistResponse.data.files?.[GITHUB_CONFIG.PORTFOLIO_CONFIG_FILENAME] as GistFile | undefined;
  const portfolioConfig: GistContent = JSON.parse(portfolioFile?.content || '{"repositories":[]}');

  // Get all repos
  const repos = await octokit.rest.repos.listForUser({
    username: GITHUB_CONFIG.USERNAME,
    per_page: 100,
  });

  // Create sets for quick lookup
  const portfolioRepoNames = new Set(portfolioConfig.repositories.map((r) => r.name));
  const starredRepoNames = new Set(portfolioConfig.repositories.filter((r) => r.isStarred).map((r) => r.name));

  // Filter and categorize repos
  return {
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
}

export default async function Projects() {
  const { starred, normal } = await getRepositories();
  const repos = [...starred, ...normal];

  return (
    <>
      <h1 className="mb-6 text-3xl font-bold">My Code</h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {repos.map((repo) => (
          <Card key={repo.id} className="relative border-white bg-black bg-opacity-10 p-4 text-white">
            {repo.isStarred && <StarIcon />}
            <h2 className="mb-2 text-xl font-bold">{repo.name}</h2>
            <p className="mb-4 text-sm">{repo.description}</p>
            <p className="mt-4 text-xs text-gray-400">
              <span className="font-bold">Created:</span> {formatDate(repo.created_at)}
            </p>
            <p className="mb-2 mt-1 text-xs text-gray-400">
              <span className="font-bold">Last commit:</span> {formatDate(repo.pushed_at)}
            </p>
            <Button asChild className="mt-2 bg-white text-black hover:bg-gray-200">
              <Link href={`/projects/${repo.name}`}>View Details</Link>
            </Button>
          </Card>
        ))}
      </div>
    </>
  );
}

export const dynamic = 'force-dynamic';
