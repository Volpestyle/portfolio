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

  return (
    <Card
      className={cn(
        'relative flex h-full border-white bg-black bg-opacity-10 text-white',
        isChat ? 'flex-row items-start gap-3 p-3 text-sm' : 'flex-col p-4'
      )}
    >
      {isChat && (
        <div className="mt-1">
          <Icon className="h-4 w-4 opacity-80" />
        </div>
      )}
      <div className="flex-1">
        <h2
          className={cn(
            'flex items-center justify-between font-bold',
            isChat ? 'mb-1 text-base' : 'mb-2 text-xl'
          )}
        >
          {isChat ? (
            <span>{repo.name}</span>
          ) : (
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
          )}
          {repo.isStarred && <StarIcon />}
        </h2>
        {repo.description && (
          <p className={cn('opacity-90', isChat ? 'mb-2 text-xs' : 'mb-4 text-sm')}>{repo.description}</p>
        )}
        <p className={cn('text-gray-400', isChat ? 'text-[11px]' : 'text-xs')}>
          <span className="font-bold">Created:</span> {formatDate(repo.created_at)}
        </p>
        {repo.pushed_at && (
          <p className={cn('text-gray-400', isChat ? 'text-[11px]' : 'text-xs', isChat ? 'mt-0.5' : 'mb-2 mt-1')}>
            <span className="font-bold">Last commit:</span> {formatDate(repo.pushed_at)}
          </p>
        )}
      </div>
      {isChat ? (
        <Button
          onClick={(event) => {
            event.stopPropagation();
            onOpen?.();
          }}
          disabled={!onOpen}
          className="ml-3 h-9 w-9 self-center border border-white bg-transparent text-white transition-all duration-300 hover:bg-white hover:text-black disabled:border-white/20 disabled:text-white/50"
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
      ) : (
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
      )}
    </Card>
  );
}
