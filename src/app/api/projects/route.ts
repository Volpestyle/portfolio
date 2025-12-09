import { NextResponse } from 'next/server';
import { buildProjectSummary } from '@portfolio/chat-data';
import { getChatDataProviders } from '@/server/chat/dataProviders';
import { getVisibleProjects } from '@/server/portfolio/store';
import { normalizeProjectKey } from '@/lib/projects/normalize';

export const runtime = 'nodejs';

export async function GET() {
  const { projectRepository } = getChatDataProviders();
  const projects = await projectRepository.listProjects();
  const visible = await getVisibleProjects();
  const orderMap = new Map<string, number>();
  visible.forEach((project, index) => orderMap.set(normalizeProjectKey(project.name), index));

  const keyedProjects = projects.map((project) => ({
    project,
    key: normalizeProjectKey(project.slug ?? project.name),
  }));

  const filtered = orderMap.size ? keyedProjects.filter(({ key }) => orderMap.has(key)) : keyedProjects;

  const summaries = filtered.map(({ project }) => buildProjectSummary(project));

  if (orderMap.size) {
    summaries.sort((a, b) => {
      const keyA = normalizeProjectKey(a.slug ?? a.name);
      const keyB = normalizeProjectKey(b.slug ?? b.name);
      const orderA = orderMap.get(keyA) ?? Number.MAX_SAFE_INTEGER;
      const orderB = orderMap.get(keyB) ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.name.localeCompare(b.name);
    });
  }

  return NextResponse.json({ projects: summaries });
}
