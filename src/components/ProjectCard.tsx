'use client';

import { Card } from '@/components/ui/card';
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
import { motion } from 'framer-motion';
import { springAnimations } from '@/lib/animations';
import { AnimatedExpandButton } from '@/components/ui/AnimatedExpandButton';
import type { RepoData } from '@/lib/github-server';
import { LanguageBar } from '@/components/LanguageBar';

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
  const [isTitleHovered, setIsTitleHovered] = useState(false);
  const Icon = repo.icon ? iconMap[repo.icon] || ArrowRight : ArrowRight;
  const isChat = variant === 'chat';

  if (isChat) {
    return (
      <Card className="group relative flex h-full flex-col overflow-hidden border-white bg-black/5 p-4 text-white backdrop-blur-sm transition-all duration-300 hover:border-white/60 hover:bg-black/20">
        <h2 className="mb-2 flex items-center justify-between text-xl font-bold">
          <button
            onClick={(event) => {
              event.stopPropagation();
              onOpen?.();
            }}
            disabled={!onOpen}
            className="group/title relative inline-flex items-center gap-2 rounded transition-all duration-300 hover:bg-white hover:text-black active:bg-white active:text-black disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-white"
            style={{
              paddingLeft: isTitleHovered ? '12px' : '0px',
              paddingRight: isTitleHovered ? '12px' : '0px',
              paddingTop: '8px',
              paddingBottom: '8px',
            }}
            onMouseEnter={() => setIsTitleHovered(true)}
            onMouseLeave={() => setIsTitleHovered(false)}
          >
            {repo.name}
            <motion.div
              animate={{
                x: isTitleHovered ? 0 : -8,
                opacity: isTitleHovered ? 1 : 0,
              }}
              transition={springAnimations.iconText}
            >
              <Icon className="h-4 w-4" />
            </motion.div>
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

        {repo.languagePercentages && repo.languagePercentages.length > 0 && (
          <div className="mb-3 mt-3">
            <LanguageBar languages={repo.languagePercentages} maxLabels={3} />
          </div>
        )}

        {repo.tags && repo.tags.length > 0 && (
          <div className="mb-4 mt-3 flex flex-wrap gap-2">
            {repo.tags.slice(0, 6).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-white/80"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <AnimatedExpandButton
          icon={<ArrowRight className="h-5 w-5" />}
          text="view details"
          wrapperClassName="mt-auto"
          disabled={!onOpen}
          onClick={(event) => {
            event.stopPropagation();
            onOpen?.();
          }}
        />
      </Card>
    );
  }

  return (
    <Card className="relative flex h-full flex-col border-white bg-black/5 p-4 text-white backdrop-blur-sm">
      <h2 className="mb-2 flex items-center justify-between text-xl font-bold">
        <Link
          href={`/projects/${repo.name}`}
          className="group relative inline-flex items-center gap-2 rounded transition-all duration-300 hover:bg-white hover:text-black active:bg-white active:text-black"
          style={{
            paddingLeft: isTitleHovered ? '12px' : '0px',
            paddingRight: isTitleHovered ? '12px' : '0px',
            paddingTop: '8px',
            paddingBottom: '8px',
          }}
          onMouseEnter={() => setIsTitleHovered(true)}
          onMouseLeave={() => setIsTitleHovered(false)}
        >
          {repo.name}
          <motion.div
            animate={{
              x: isTitleHovered ? 0 : -8,
              opacity: isTitleHovered ? 1 : 0,
            }}
            transition={springAnimations.iconText}
          >
            <Icon className="h-4 w-4" />
          </motion.div>
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

      {repo.languagePercentages && repo.languagePercentages.length > 0 && (
        <div className="mb-3 mt-3">
          <LanguageBar languages={repo.languagePercentages} maxLabels={3} />
        </div>
      )}

      {repo.tags && repo.tags.length > 0 && (
        <div className="mb-4 mt-3 flex flex-wrap gap-2">
          {repo.tags.slice(0, 6).map((tag) => (
            <span key={tag} className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-white/80">
              {tag}
            </span>
          ))}
        </div>
      )}
      <AnimatedExpandButton
        icon={<ArrowRight className="h-5 w-5" />}
        text="view details"
        wrapperClassName="mt-auto"
        href={`/projects/${repo.name}`}
      />
    </Card>
  );
}
