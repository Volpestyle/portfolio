import 'highlight.js/styles/github-dark.css';
import '@/styles/markdown.css';
import { Octokit } from '@octokit/rest';
import { ProjectContent } from './ProjectContent';
import { notFound } from 'next/navigation';

async function getProjectData(pid: string) {
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });

  try {
    const [readme, repoInfo] = await Promise.all([
      octokit.rest.repos
        .getReadme({
          owner: 'volpestyle',
          repo: pid,
        })
        .then((response) => Buffer.from(response.data.content, 'base64').toString()),
      octokit.rest.repos
        .get({
          owner: 'volpestyle',
          repo: pid,
        })
        .then((response) => ({
          url: response.data.html_url,
          created_at: response.data.created_at,
          pushed_at: response.data.pushed_at,
        })),
    ]);

    return { readme, repoInfo };
  } catch (error) {
    console.error('Error fetching project data:', error);
    notFound();
  }
}

export default async function ProjectDetail({ params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params;
  const { readme, repoInfo } = await getProjectData(pid);
  return <ProjectContent pid={pid} readme={readme} repoInfo={repoInfo} />;
}
