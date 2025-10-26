import ChatDock from '@/components/chat/ChatDock';
import { HeroTitle } from '@/components/HeroTitle';
import { getPortfolioRepos, getRepoReadme } from '@/lib/github-server';
import { PROJECT_LIST_QUERY_KEY, readmeQueryKey } from '@/lib/query-keys';
import { QueryClient, dehydrate } from '@tanstack/react-query';

export default async function Home() {
  const repoData = await getPortfolioRepos();
  const initialProjectList = [...repoData.starred, ...repoData.normal];

  const queryClient = new QueryClient();
  queryClient.setQueryData(PROJECT_LIST_QUERY_KEY, initialProjectList);

  const topRepos = initialProjectList.slice(0, 6);
  await Promise.allSettled(
    topRepos.map(async (repo) => {
      const owner = repo.owner?.login;
      if (!owner) {
        return;
      }
      try {
        const readme = await getRepoReadme(repo.name, owner);
        queryClient.setQueryData(readmeQueryKey(owner, repo.name), readme);
      } catch (error) {
        console.warn(`Failed to prefetch README for ${repo.name}`, error);
      }
    })
  );

  const dehydratedState = dehydrate(queryClient);

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-stretch px-4 py-10">
      <HeroTitle />
      <ChatDock initialQueryState={dehydratedState} />
    </div>
  );
}
