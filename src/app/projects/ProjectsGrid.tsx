'use client';

import { ProjectCard } from './ProjectCard';
import type { RepoData } from '@/lib/github-server';

export function ProjectsGrid({ repos }: { repos: RepoData[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {repos.map((repo, index) => (
        <ProjectCard key={index} repo={repo} />
      ))}
    </div>
  );
}