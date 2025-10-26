'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { StarIcon } from '@/lib/svgs';
import { cn, formatDate } from '@/lib/utils';
import {
  ArrowRight,
  Code2,
  Sparkles,
  Rocket,
  Database,
  Globe,
  Palette,
  Server,
  Cpu,
  Zap,
  Shield,
  Cloud,
  Package,
  Terminal,
  GitBranch,
  Scissors,
  MessagesSquare,
  Rss,
  Briefcase,
} from 'lucide-react';
import { useState } from 'react';
import type { RepoData } from '@/lib/github-server';

interface ProjectCardProps {
  repo: RepoData;
  variant?: 'default' | 'chat';
  onOpen?: () => void;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  code: Code2,
  sparkles: Sparkles,
  rocket: Rocket,
  database: Database,
  globe: Globe,
  palette: Palette,
  server: Server,
  cpu: Cpu,
  zap: Zap,
  shield: Shield,
  cloud: Cloud,
  package: Package,
  terminal: Terminal,
  git: GitBranch,
  scissors: Scissors,
  messagesSquare: MessagesSquare,
  rss: Rss,
  briefcase: Briefcase,
};

export function ProjectCard({ repo, variant = 'default', onOpen }: ProjectCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const Icon = repo.icon ? iconMap[repo.icon] || ArrowRight : ArrowRight;
  const isChat = variant === 'chat';

  if (isChat) {
    return (
      <Card className="group relative flex h-full flex-col overflow-hidden border-white bg-black/10 p-4 text-white backdrop-blur-sm transition-all duration-300 hover:border-white/60 hover:bg-black/20">
        <h2 className="mb-2 flex items-center justify-between text-xl font-bold">
          <button
            onClick={(event) => {
              event.stopPropagation();
              onOpen?.();
            }}
            disabled={!onOpen}
            className="group/title relative inline-flex items-center gap-2 rounded transition-all duration-300 hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-white"
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
            <Icon className="h-4 w-4 -translate-x-2 opacity-0 transition-all duration-300 group-hover/title:translate-x-0 group-hover/title:opacity-100" />
          </button>
          {repo.isStarred && <StarIcon />}
        </h2>

        {repo.description && <p className="mb-4 text-sm opacity-90">{repo.description}</p>}

        <p className="text-xs text-gray-400">
          <span className="font-bold">Created:</span> {formatDate(repo.created_at)}
        </p>
        {repo.pushed_at && (
          <p className="mb-2 mt-1 text-xs text-gray-400">
            <span className="font-bold">Last commit:</span> {formatDate(repo.pushed_at)}
          </p>
        )}

        <Button
          onClick={(event) => {
            event.stopPropagation();
            onOpen?.();
          }}
          disabled={!onOpen}
          className="group/btn relative mt-auto h-10 w-10 overflow-hidden border border-white bg-transparent text-white transition-all duration-300 hover:w-32 hover:border-white hover:bg-white hover:text-black disabled:border-white/20 disabled:text-white/50"
        >
          <div className="relative flex h-full w-full items-center justify-center">
            <span className="absolute whitespace-nowrap text-black opacity-0 transition-opacity duration-300 group-hover/btn:opacity-100">
              View Details
            </span>
            <ArrowRight className="absolute h-5 w-5 transition-all duration-300 group-hover/btn:translate-x-10 group-hover/btn:opacity-0" />
          </div>
        </Button>
      </Card>
    );
  }

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
          <Icon className="h-4 w-4 -translate-x-2 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
        </Link>
        {repo.isStarred && <StarIcon />}
      </h2>
      {repo.description && <p className="mb-4 text-sm opacity-90">{repo.description}</p>}
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
