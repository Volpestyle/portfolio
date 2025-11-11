import { DocumentContent } from './DocumentContent';
import { getDocumentContent } from '@/lib/github-server';
import { notFound } from 'next/navigation';

type PageContext = {
  params: Promise<{ pid: string; path: string[] }>;
};

export default async function DocumentPage({ params }: PageContext) {
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
