import { DocumentLoader } from './DocumentLoader';

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ pid: string; path: string[] }>;
}) {
  const { pid, path } = await params;
  return <DocumentLoader pid={pid} path={path} />;
}