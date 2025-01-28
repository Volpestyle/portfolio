import 'highlight.js/styles/github-dark.css';
import '@/styles/markdown.css';
import { Octokit } from '@octokit/rest';
import { ProjectContent } from './ProjectContent';

async function getReadme(pid: string) {
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });

  try {
    const { data } = await octokit.rest.repos.getReadme({
      owner: 'volpestyle',
      repo: pid,
    });
    return Buffer.from(data.content, 'base64').toString();
  } catch (error) {
    console.error('Error fetching README:', error);
    throw new Error('Failed to fetch README');
  }
}

async function getRepoInfo(pid: string) {
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });

  try {
    const { data } = await octokit.rest.repos.get({
      owner: 'volpestyle',
      repo: pid,
    });

    return {
      url: data.html_url,
      created_at: data.created_at,
      pushed_at: data.pushed_at,
    };
  } catch (error) {
    console.error('Error fetching repository info:', error);
    throw new Error('Failed to fetch repository info');
  }
}

export default async function ProjectDetail({ params }: { params: { pid: string } }) {
  // Fetch data on the server
  const [readme, repoInfo] = await Promise.all([getReadme(params.pid), getRepoInfo(params.pid)]);

  return <ProjectContent pid={params.pid} readme={readme} repoInfo={repoInfo} />;
}
