'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export function AnimatedLayout({ children }: { children: ReactNode }) {
  return (
    <motion.div
      layout
      className="border-white/1 relative w-full max-w-4xl border bg-black/50 text-white"
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <>{children}</>
    </motion.div>
  );
}
