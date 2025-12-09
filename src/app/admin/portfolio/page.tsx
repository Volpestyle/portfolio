import { listAllGitHubRepos, type GitHubRepoSummary } from '@/lib/github-api';
import { GH_CONFIG } from '@/lib/constants';
import { shouldUseFixtureRuntime } from '@/lib/test-flags';
import { getAllProjects } from '@/server/portfolio/store';
import { PortfolioConfigManager } from '../components/PortfolioConfigManager';

export const metadata = {
  title: 'Portfolio Config',
  description: 'Manage portfolio repositories',
};

export const revalidate = 0;

async function loadRepos(): Promise<GitHubRepoSummary[]> {
  if (shouldUseFixtureRuntime()) {
    const { TEST_REPO } = await import('@portfolio/test-support/fixtures');
    return [
      {
        name: TEST_REPO.name,
        owner: TEST_REPO.owner?.login ?? GH_CONFIG.USERNAME,
        description: TEST_REPO.description,
        private: false,
        html_url: TEST_REPO.html_url,
        topics: TEST_REPO.topics,
        language: TEST_REPO.language,
        default_branch: 'main',
      },
    ];
  }

  return listAllGitHubRepos();
}

export default async function PortfolioConfigPage() {
  let initialProjects: Awaited<ReturnType<typeof getAllProjects>> | undefined;
  let initialRepos: GitHubRepoSummary[] | undefined;

  try {
    [initialProjects, initialRepos] = await Promise.all([getAllProjects(), loadRepos()]);
  } catch (error) {
    console.error('[admin/portfolio] Failed to prefetch portfolio config', error);
  }

  return <PortfolioConfigManager initialProjects={initialProjects} initialRepos={initialRepos} />;
}
