'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ReactNode, useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

export function AnimatedLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

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
