'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface LanguageBarProps {
  languages: Array<{ name: string; percent: number }>;
  className?: string;
  showLabels?: boolean;
  maxLabels?: number;
}

// Color palette for different languages (inspired by GitHub language colors)
const languageColors: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Java: '#b07219',
  Go: '#00ADD8',
  Rust: '#dea584',
  'C++': '#f34b7d',
  C: '#555555',
  'C#': '#178600',
  Ruby: '#701516',
  PHP: '#4F5D95',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Dart: '#00B4AB',
  Scala: '#c22d40',
  HTML: '#e34c26',
  CSS: '#563d7c',
  SCSS: '#c6538c',
  Vue: '#41b883',
  Shell: '#89e051',
  PowerShell: '#012456',
  Dockerfile: '#384d54',
  Markdown: '#083fa1',
  JSON: '#292929',
  YAML: '#cb171e',
  SQL: '#e38c00',
  R: '#198CE7',
  Lua: '#000080',
  Perl: '#0298c3',
  Haskell: '#5e5086',
  Elixir: '#6e4a7e',
  Clojure: '#db5855',
  Objective: '#438eff',
  Assembly: '#6E4C13',
  Vim: '#199f4b',
  Makefile: '#427819',
  Jupyter: '#DA5B0B',
};

function getLanguageColor(language: string): string {
  // Direct match
  if (languageColors[language]) {
    return languageColors[language];
  }

  // Case-insensitive match
  const lowerLang = language.toLowerCase();
  const match = Object.entries(languageColors).find(([key]) => key.toLowerCase() === lowerLang);

  if (match) {
    return match[1];
  }

  // Generate a consistent color from the language name
  let hash = 0;
  for (let i = 0; i < language.length; i++) {
    hash = language.charCodeAt(i) + ((hash << 5) - hash);
  }

  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 60%, 50%)`;
}

export function LanguageBar({ languages, className, showLabels = true, maxLabels = 4 }: LanguageBarProps) {
  const [hoveredLanguage, setHoveredLanguage] = useState<string | null>(null);

  // Filter out languages with very small percentages for visual clarity
  const visibleLanguages = languages.filter((lang) => lang.percent >= 0.1);

  if (visibleLanguages.length === 0) {
    return null;
  }

  // Sort by percentage descending
  const sortedLanguages = [...visibleLanguages].sort((a, b) => b.percent - a.percent);

  return (
    <div className={cn('w-full', className)}>
      {/* Language Bar */}
      <div className="mb-2 flex h-2 w-full overflow-hidden rounded-full bg-white/10">
        {sortedLanguages.map((lang, index) => {
          const color = getLanguageColor(lang.name);
          const isHovered = hoveredLanguage === lang.name;

          return (
            <motion.div
              key={lang.name}
              className="relative cursor-pointer first:rounded-l-full last:rounded-r-full"
              style={{
                width: `${lang.percent}%`,
                backgroundColor: color,
              }}
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{
                opacity: isHovered ? 1 : 0.9,
                scaleX: 1,
              }}
              transition={{
                duration: 0.5,
                delay: index * 0.05,
                opacity: { duration: 0.2 },
              }}
              onMouseEnter={() => setHoveredLanguage(lang.name)}
              onMouseLeave={() => setHoveredLanguage(null)}
              whileHover={{ opacity: 1 }}
            >
              {/* Tooltip on hover */}
              {isHovered && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-black/90 px-2 py-1 text-xs text-white shadow-lg"
                >
                  {lang.name}: {lang.percent.toFixed(1)}%
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Language Labels */}
      {showLabels && sortedLanguages.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {sortedLanguages.slice(0, maxLabels).map((lang) => {
            const color = getLanguageColor(lang.name);
            const isHovered = hoveredLanguage === lang.name;

            return (
              <motion.div
                key={lang.name}
                className="flex items-center gap-1.5 text-xs text-white/80"
                onMouseEnter={() => setHoveredLanguage(lang.name)}
                onMouseLeave={() => setHoveredLanguage(null)}
                animate={{ opacity: isHovered ? 1 : 0.8 }}
                whileHover={{ scale: 1.05 }}
              >
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className={cn(isHovered && 'font-semibold')}>{lang.name}</span>
                <span className="text-white/60">{lang.percent.toFixed(1)}%</span>
              </motion.div>
            );
          })}
          {sortedLanguages.length > maxLabels && (
            <span className="text-xs text-white/60">+{sortedLanguages.length - maxLabels} more</span>
          )}
        </div>
      )}
    </div>
  );
}
