'use client';

import { ProjectCard } from '@/components/ProjectCard';
import type { ProjectSummary, RepoData } from '@portfolio/chat-contract';

type ProjectCardEntry = {
  project: ProjectSummary;
  repo?: RepoData;
};

export function ProjectsGrid({ projects }: { projects: ProjectCardEntry[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {projects.map(({ project, repo }) => (
        <ProjectCard key={project.id} project={project} repo={repo} />
      ))}
    </div>
  );
}
