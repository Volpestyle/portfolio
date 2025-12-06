'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

type CollapsibleSectionProps = {
  title: string;
  icon?: React.ReactNode;
  count?: number;
  children: React.ReactNode;
  defaultExpanded?: boolean;
};

export function CollapsibleSection({ title, icon, count, children, defaultExpanded = false }: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="group -mx-2 flex w-[calc(100%+16px)] items-center justify-between rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/5"
      >
        <span className="flex items-center gap-1.5">
          {icon ? <span className="text-white/40 transition-colors group-hover:text-white/60">{icon}</span> : null}
          <p className="font-mono text-xs uppercase tracking-wider text-white/50 transition-colors group-hover:text-white/70">
            {title}
            {count !== undefined ? <span className="ml-1 text-white/30">({count})</span> : null}
          </p>
        </span>
        <span className="flex items-center gap-1">
          <span className="font-mono text-[10px] text-white/30 transition-colors group-hover:text-white/50">
            {isExpanded ? 'Hide' : 'Show'}
          </span>
          <motion.div
            animate={{ rotate: isExpanded ? 0 : -90 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="text-white/40 transition-colors group-hover:text-white/60"
          >
            <ChevronDown className="h-3 w-3" />
          </motion.div>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { type: 'spring', stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 },
            }}
            className="overflow-hidden"
          >
            <div className="mt-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
