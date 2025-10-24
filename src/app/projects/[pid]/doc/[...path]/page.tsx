import { DocumentContent } from './DocumentContent';
import { getDocumentContent } from '@/lib/github-server';
import { notFound } from 'next/navigation';

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ pid: string; path: string[] }>;
}) {
  const { pid, path } = await params;
  const docPath = path.join('/');

  try {
    const { content, projectName } = await getDocumentContent(pid, docPath);
    return <DocumentContent pid={pid} path={path} content={content} projectName={projectName} />;
  } catch (error) {
    console.error('Error loading document:', error);
    notFound();
  }
}

export const revalidate = 3600; // Revalidate every hour