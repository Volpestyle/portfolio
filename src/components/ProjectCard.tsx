'use client';

import { useState, type ComponentType } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Briefcase,
  Cloud,
  Code2,
  Cpu,
  Database,
  GitBranch,
  Globe,
  MessagesSquare,
  Package,
  Palette,
  Rocket,
  Rss,
  Scissors,
  Server,
  Shield,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { AnimatedExpandButton } from '@/components/ui/AnimatedExpandButton';
import { LanguageBar } from '@/components/LanguageBar';
import { StarIcon } from '@/lib/svgs';
import { formatDate } from '@/lib/utils';
import type { ProjectSummary, RepoData } from '@portfolio/chat-contract';
import { motion } from 'framer-motion';

interface ProjectCardProps {
  project: ProjectSummary;
  repo?: RepoData;
  variant?: 'default' | 'chat';
  onOpen?: () => void;
  isExpanded?: boolean;
  layoutId?: string;
}

const iconMap: Record<string, ComponentType<{ className?: string }>> = {
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

function buildProjectLink(project: ProjectSummary) {
  const slug = project.slug ?? project.name;
  return `/projects/${encodeURIComponent(slug)}`;
}

function resolveRepoKey(project: ProjectSummary) {
  return (project.slug ?? project.name).toLowerCase();
}

export function ProjectCard({ project, repo, variant = 'default', onOpen, isExpanded }: ProjectCardProps) {
  const [isTitleHovered, setIsTitleHovered] = useState(false);
  const slug = project.slug ?? project.name;
  const isChat = variant === 'chat';

  const Icon = repo?.icon ? iconMap[repo.icon] || ArrowRight : ArrowRight;
  const summaryText = project.oneLiner || repo?.summary || repo?.description || 'Details coming soon.';
  const createdDate = repo?.created_at ? formatDate(repo.created_at) : null;
  const pushedDate = repo?.pushed_at
    ? formatDate(repo.pushed_at)
    : repo?.updated_at
      ? formatDate(repo.updated_at)
      : null;
  const languagePercentages = repo?.languagePercentages?.length ? repo.languagePercentages : null;
  const tags = (project.tags?.length ? project.tags : (repo?.tags ?? [])).slice(0, 6);
  const projectLink = buildProjectLink(project);

  if (isChat) {
    return (
      <Card className="group relative flex h-full flex-col overflow-hidden border-0 bg-transparent p-4 text-white">
        <motion.h2 className="mb-2 flex items-center justify-between text-xl font-bold">
          <button
            onClick={(event) => {
              event.stopPropagation();
              onOpen?.();
            }}
            disabled={!onOpen}
            className="group/title relative inline-flex items-center gap-2 rounded transition-all duration-200 hover:bg-white hover:text-black active:bg-white active:text-black disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-white"
            style={{
              paddingLeft: isTitleHovered ? '12px' : '0px',
              paddingRight: isTitleHovered ? '12px' : '0px',
              paddingTop: '8px',
              paddingBottom: '8px',
            }}
            onMouseEnter={() => setIsTitleHovered(true)}
            onMouseLeave={() => setIsTitleHovered(false)}
          >
            {project.name}
            <Icon className="h-4 w-4" />
          </button>
          {repo?.isStarred && <StarIcon />}
        </motion.h2>

        {summaryText && <p className="mb-4 text-sm opacity-90">{summaryText}</p>}

        {createdDate && (
          <p className="text-xs text-gray-400">
            <span className="font-bold">Created:</span> {createdDate}
          </p>
        )}
        {pushedDate && (
          <p className="mb-2 mt-1 text-xs text-gray-400">
            <span className="font-bold">Last commit:</span> {pushedDate}
          </p>
        )}

        {languagePercentages && (
          <div className="mb-3 mt-3">
            <LanguageBar languages={languagePercentages} maxLabels={3} />
          </div>
        )}

        {tags.length > 0 && (
          <div className="mb-4 mt-3 flex min-w-0 flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={`${resolveRepoKey(project)}-${tag}`}
                className="max-w-full break-words rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-white/80"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <AnimatedExpandButton
          icon={<ArrowRight className="h-5 w-5" />}
          text={isExpanded ? 'hide details' : 'view details'}
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
    <Card className="relative flex h-full flex-col overflow-hidden border-white/30 bg-black/70 p-4 text-white backdrop-blur-sm">
      <motion.h2 className="mb-2 flex items-center justify-between text-xl font-bold">
        <Link
          href={projectLink}
          className="group relative inline-flex items-center gap-2 rounded transition-all duration-200 hover:bg-white hover:text-black active:bg-white active:text-black"
          style={{
            paddingLeft: isTitleHovered ? '12px' : '0px',
            paddingRight: isTitleHovered ? '12px' : '0px',
          }}
          onMouseEnter={() => setIsTitleHovered(true)}
          onMouseLeave={() => setIsTitleHovered(false)}
        >
          {project.name}
          <Icon className="h-4 w-4" />
        </Link>
        {repo?.isStarred && <StarIcon />}
      </motion.h2>

      {summaryText && <p className="mb-4 text-sm opacity-90">{summaryText}</p>}
      {createdDate && (
        <p className="text-xs text-gray-400">
          <span className="font-bold">Created:</span> {createdDate}
        </p>
      )}
      {pushedDate && (
        <p className="mb-2 mt-1 text-xs text-gray-400">
          <span className="font-bold">Last commit:</span> {pushedDate}
        </p>
      )}

      {languagePercentages && (
        <div className="mb-3 mt-3">
          <LanguageBar languages={languagePercentages} maxLabels={3} />
        </div>
      )}

      {tags.length > 0 && (
        <div className="mb-4 mt-3 flex min-w-0 flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={`${slug}-tag-${tag}`}
              className="max-w-full break-words rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-white/80"
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
        href={projectLink}
      />
    </Card>
  );
}
