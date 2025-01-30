import 'highlight.js/styles/github-dark.css';
import '@/styles/markdown.css';
import { ProjectLoader } from './ProjectLoader';

export default async function ProjectDetail({ params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params;
  return <ProjectLoader pid={pid} />;
}
