'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { StarIcon } from '@/lib/svgs';
import { formatDate } from '@/lib/utils';
import { ArrowRight, Code2, Sparkles, Rocket, Database, Globe, Palette, Server, Cpu, Zap, Shield, Cloud, Package, Terminal, GitBranch, Scissors } from 'lucide-react';
import { useState } from 'react';
import type { RepoData } from '@/lib/github-server';

interface ProjectCardProps {
  repo: RepoData;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  'code': Code2,
  'sparkles': Sparkles,
  'rocket': Rocket,
  'database': Database,
  'globe': Globe,
  'palette': Palette,
  'server': Server,
  'cpu': Cpu,
  'zap': Zap,
  'shield': Shield,
  'cloud': Cloud,
  'package': Package,
  'terminal': Terminal,
  'git': GitBranch,
  'scissors': Scissors,
};

export function ProjectCard({ repo }: ProjectCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const Icon = repo.icon ? iconMap[repo.icon.toLowerCase()] || ArrowRight : ArrowRight;

  return (
    <Card className="relative flex h-full flex-col border-white bg-black bg-opacity-10 p-4 text-white">
      <h2 className="mb-2 flex items-center justify-between text-xl font-bold">
        <Link
          href={`/projects/${repo.name}`}
          className="group relative inline-flex items-center gap-2 rounded transition-all duration-300 hover:bg-white hover:text-black"
          style={{
            paddingLeft: isHovered ? '12px' : '0px',
            paddingRight: isHovered ? '12px' : '0px',
            paddingTop: '8px',
            paddingBottom: '8px',
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {repo.name}
          <Icon className="h-4 w-4 opacity-0 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0 -translate-x-2" />
        </Link>
        {repo.isStarred && <StarIcon />}
      </h2>
      <p className="mb-4 text-sm">{repo.description}</p>
      <p className="text-xs text-gray-400">
        <span className="font-bold">Created:</span> {formatDate(repo.created_at)}
      </p>
      {repo.pushed_at && (
        <p className="mb-2 mt-1 text-xs text-gray-400">
          <span className="font-bold">Last commit:</span> {formatDate(repo.pushed_at)}
        </p>
      )}
      <Button
        asChild
        className="group relative mt-auto h-10 w-10 overflow-hidden border border-white bg-transparent text-white transition-all duration-300 hover:w-32 hover:border-white hover:bg-white hover:text-black"
      >
        <Link href={`/projects/${repo.name}`}>
          <div className="relative flex h-full w-full items-center justify-center">
            <span className="absolute whitespace-nowrap text-black opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              View Details
            </span>
            <ArrowRight className="absolute h-5 w-5 transition-all duration-300 group-hover:translate-x-10 group-hover:opacity-0" />
          </div>
        </Link>
      </Button>
    </Card>
  );
}
