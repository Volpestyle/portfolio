import { DocumentContent } from './DocumentContent';
import { DirectoryContent } from './DirectoryContent';
import { getDocumentContent, getDirectoryContents } from '@/lib/github-server';
import { notFound } from 'next/navigation';

type PageContext = {
  params: Promise<{ pid: string; path: string[] }>;
};

export default async function DocumentPage({ params }: PageContext) {
  const { pid, path } = await params;
  const docPath = path.join('/');

  // Try as file first
  try {
    const { content, projectName } = await getDocumentContent(pid, docPath);
    return (
      <div className="-mx-4 -my-8 bg-black/10 sm:-mx-8">
        <DocumentContent pid={pid} path={path} content={content} projectName={projectName} />
      </div>
    );
  } catch {
    // Not a file, try as directory
  }

  // Try as directory
  try {
    const entries = await getDirectoryContents(pid, docPath);
    return (
      <div className="-mx-4 -my-8 bg-black/10 sm:-mx-8">
        <DirectoryContent pid={pid} path={path} entries={entries} />
      </div>
    );
  } catch (error) {
    console.error('Error loading document or directory:', error);
    notFound();
  }
}

export const revalidate = 3600; // Revalidate every hour
