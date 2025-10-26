import {
  getRepos,
  getRepoByName,
  getReadmeForRepo,
  getRawDoc,
} from '@/lib/github-server';

type ProjectFilter = {
  field: 'language' | 'topic';
  value: string;
};

type ListProjectsInput = {
  filters?: ProjectFilter[];
};

type GetReadmeInput = {
  repo: string;
};

type GetDocInput = {
  repo: string;
  path: string;
};

type NavigateInput = {
  section: 'about' | 'projects' | 'contact';
};

export async function listProjects({ filters }: ListProjectsInput = {}) {
  const all = await getRepos();
  let filtered = all;

  const constraints = Array.isArray(filters) ? filters : [];
  const languageFilter = constraints.find((filter) => filter.field === 'language')?.value;
  const topicFilter = constraints.find((filter) => filter.field === 'topic')?.value;

  if (languageFilter) {
    const languageKey = languageFilter.toLowerCase();
    filtered = filtered.filter((repo) => repo.language?.toLowerCase() === languageKey);
  }

  if (topicFilter) {
    const topicKey = topicFilter.toLowerCase();
    filtered = filtered.filter((repo) => repo.topics?.some((t) => t.toLowerCase() === topicKey));
  }

  return filtered.slice(0, 6);
}

export async function getReadme({ repo }: GetReadmeInput) {
  const repoInfo = await getRepoByName(repo);
  const owner = repoInfo.owner?.login;
  const readme = await getReadmeForRepo(repoInfo.name, owner);
  return { repo: repoInfo, readme };
}

export async function getDoc({ repo, path }: GetDocInput) {
  const data = await getRawDoc(repo, path);
  const title = path.split('/').pop() || 'Document';
  return {
    repoName: data.projectName || repo,
    path,
    title,
    content: data.content,
  };
}

export function navigate({ section }: NavigateInput) {
  const map = {
    about: '/about',
    projects: '/projects',
    contact: '/contact',
  } as const;

  return { url: map[section] };
}
