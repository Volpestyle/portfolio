'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import type { ResumeEntry } from '@portfolio/chat-contract';
import { cn } from '@/lib/utils';
import { ToolCallIndicator } from './ToolCallIndicator';

function formatDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(parsed);
}

function formatRange(experience: ResumeEntry) {
  const start = 'startDate' in experience ? formatDate(experience.startDate) : null;
  const isCurrent = 'isCurrent' in experience && Boolean(experience.isCurrent);
  const end = isCurrent ? 'Present' : (('endDate' in experience ? formatDate(experience.endDate) : null) ?? 'Past');
  if (!start) return end;
  return `${start} – ${end}`;
}

type ExperienceListProps = {
  experiences?: ResumeEntry[];
  education?: ResumeEntry[];
  awards?: ResumeEntry[];
  skills?: ResumeEntry[];
  variant?: 'default' | 'compact';
};

type ExperienceCardProps = {
  experience: ResumeEntry;
  variant?: 'default' | 'compact';
};

function ToggleButton({ isExpanded, onToggle }: { isExpanded: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="mt-3 flex h-10 items-center justify-center rounded-lg border border-white/20 bg-transparent px-4 text-white transition-colors duration-300 hover:border-white"
    >
      <motion.div
        animate={{
          rotate: isExpanded ? 180 : 0,
        }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        <ChevronDown className="h-4 w-4" />
      </motion.div>
    </button>
  );
}

function ExperienceCard({ experience: exp, variant = 'default' }: ExperienceCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTitleHovered, setIsTitleHovered] = useState(false);

  const bullets = 'bullets' in exp && Array.isArray(exp.bullets) ? exp.bullets : [];
  const skills = exp.type === 'skill' ? (exp.skills ?? [exp.name]) : (exp.skills ?? []);
  const showBullets = variant === 'default';

  const hasExpandableContent = (showBullets && bullets?.length) || skills?.length;

  const title =
    exp.type === 'education'
      ? [exp.degree, exp.field].filter(Boolean).join(' ').trim() || 'Education'
      : exp.type === 'award'
        ? exp.title
        : exp.type === 'skill'
          ? exp.name
          : exp.title;
  const org =
    exp.type === 'education'
      ? exp.institution
      : exp.type === 'award'
        ? exp.issuer
        : exp.type === 'skill'
          ? exp.category
          : exp.company;
  const location = 'location' in exp ? exp.location : undefined;
  const summary = 'summary' in exp ? exp.summary : undefined;

  const hasDates = 'startDate' in exp || 'endDate' in exp || 'isCurrent' in exp;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className={cn(
        'flex flex-col rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition-colors duration-300 hover:border-white/20 hover:bg-black/40',
        variant === 'compact' && 'p-3'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          {hasDates ? <p className="text-sm uppercase tracking-wide text-white/50">{formatRange(exp)}</p> : null}
          <div>
            <button
              onClick={() => hasExpandableContent && setIsExpanded(!isExpanded)}
              disabled={!hasExpandableContent}
              className="group/title relative inline-flex items-center gap-2 rounded text-left transition-all duration-200 hover:bg-white hover:text-black active:bg-white active:text-black disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-white"
              style={{
                paddingLeft: isTitleHovered ? '12px' : '0px',
                paddingRight: isTitleHovered ? '12px' : '0px',
                paddingTop: '8px',
                paddingBottom: '8px',
              }}
              onMouseEnter={() => setIsTitleHovered(true)}
              onMouseLeave={() => setIsTitleHovered(false)}
            >
              <h3 className="text-lg font-semibold">
                {title}
                {org ? <span className="opacity-70"> · {org}</span> : null}
              </h3>
              {hasExpandableContent && (
                <motion.div
                  animate={{
                    x: isTitleHovered ? 0 : -8,
                    opacity: isTitleHovered ? 1 : 0,
                    rotate: isExpanded ? 180 : 0,
                  }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                >
                  <ChevronDown className="h-4 w-4" />
                </motion.div>
              )}
            </button>
          </div>
          {location ? <p className="text-sm text-white/60">{location}</p> : null}
          {exp.type && <p className="text-xs uppercase text-white/50">{exp.type}</p>}
        </div>
      </div>
      {summary ? <p className="mt-2 text-sm text-white/80">{summary}</p> : null}

      <AnimatePresence initial={false}>
        {isExpanded && hasExpandableContent && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: {
                type: 'spring',
                stiffness: 300,
                damping: 30,
              },
              opacity: {
                duration: 0.2,
              },
            }}
            className="overflow-hidden"
          >
            <div className="pt-3">
              {showBullets && bullets?.length ? (
                <motion.ul
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1, duration: 0.2 }}
                  className="list-disc space-y-1 pl-5 text-sm text-white/75"
                >
                  {bullets.map((bullet: string, index: number) => (
                    <li key={`${exp.id}-bullet-${index}`}>{bullet}</li>
                  ))}
                </motion.ul>
              ) : null}
              {skills?.length ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.15, duration: 0.2 }}
                  className="mt-3 flex flex-wrap gap-2"
                >
                  {skills.map((skill: string) => (
                    <span key={skill} className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/80">
                      {skill}
                    </span>
                  ))}
                </motion.div>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {hasExpandableContent && (
        <div className="flex">
          <ToggleButton isExpanded={isExpanded} onToggle={() => setIsExpanded(!isExpanded)} />
        </div>
      )}
    </motion.div>
  );
}

// Entries arrive pre-sorted by buildUiArtifacts so we respect backend recency ordering.
export function ExperienceList({ experiences, education, awards, skills, variant = 'default' }: ExperienceListProps) {
  const experienceEntries = experiences ?? [];
  const educationEntries = education ?? [];
  const awardEntries = awards ?? [];
  const skillEntries = skills ?? [];

  const hasAny = experienceEntries.length || educationEntries.length || awardEntries.length || skillEntries.length;
  if (!hasAny) {
    return <ToolCallIndicator title="Searched resume" description="No matching entries for that query." />;
  }

  const renderSection = (title: string, entries: ResumeEntry[]) => {
    if (!entries.length) return null;
    return (
      <section>
        <p className="text-[11px] uppercase tracking-wide text-white/60">{title}</p>
        <div className="mt-2 space-y-3">
          {entries.map((exp) => {
            return <ExperienceCard key={exp.id} experience={exp} variant={variant} />;
          })}
        </div>
      </section>
    );
  };

  return (
    <div className="mt-3 rounded-xl border-t border-white/10 bg-black/5 px-4 py-2 text-white backdrop-blur-sm">
      <div className="space-y-4">
        {renderSection('Experience', experienceEntries)}
        {renderSection('Education', educationEntries)}
        {renderSection('Awards', awardEntries)}
        {renderSection('Skills', skillEntries)}
      </div>
    </div>
  );
}
