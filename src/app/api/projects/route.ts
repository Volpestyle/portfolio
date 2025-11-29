import { NextResponse } from 'next/server';
import { buildProjectSummary } from '@portfolio/chat-data';
import { getChatDataProviders } from '@/server/chat/dataProviders';

export const runtime = 'nodejs';

export async function GET() {
  const { projectRepository } = getChatDataProviders();
  const projects = await projectRepository.listProjects();
  const summaries = projects.map((project) => buildProjectSummary(project));
  return NextResponse.json({ projects: summaries });
}
