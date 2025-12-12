'use client';

import { useState } from 'react';
import { Settings, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { springAnimations } from '@/lib/animations';
import Link from 'next/link';

export function AdminSettingsDropdown() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsHovered, setSettingsHovered] = useState(false);

  return (
    <div className="relative">
      <motion.div
        animate={{
          width: settingsHovered ? '6rem' : '2.5rem',
        }}
        transition={springAnimations.width}
      >
        <button
          type="button"
          aria-label="Settings"
          aria-expanded={settingsOpen}
          aria-haspopup="true"
          className={cn(
            'group relative inline-flex h-10 w-full items-center justify-center overflow-hidden rounded-full border transition-opacity duration-200',
            settingsOpen
              ? 'border-white bg-white text-black'
              : 'border-white/20 text-white hover:border-white hover:bg-white hover:text-black'
          )}
          onMouseEnter={() => {
            setSettingsHovered(true);
            setSettingsOpen(true);
          }}
          onMouseLeave={() => {
            setSettingsHovered(false);
            setSettingsOpen(false);
          }}
          onFocus={() => {
            setSettingsHovered(true);
            setSettingsOpen(true);
          }}
          onBlur={() => {
            setSettingsHovered(false);
            setSettingsOpen(false);
          }}
        >
          <motion.div
            animate={{
              x: settingsHovered ? 32 : 0,
              opacity: settingsHovered ? 0 : 1,
            }}
            transition={springAnimations.iconText}
            className="absolute"
          >
            <Settings className={cn('h-5 w-5', settingsOpen ? 'text-black' : '')} />
          </motion.div>
          <motion.span
            animate={{
              opacity: settingsHovered ? 1 : 0,
            }}
            transition={springAnimations.fade}
            className={cn('whitespace-nowrap text-sm font-medium', settingsOpen ? 'text-black' : '')}
          >
            settings
          </motion.span>
        </button>
      </motion.div>

      {/* Dropdown menu */}
      <AnimatePresence>
        {settingsOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 min-w-[140px] overflow-hidden rounded-lg border border-white/20 bg-black/90 backdrop-blur-sm"
            onMouseEnter={() => {
              setSettingsHovered(true);
              setSettingsOpen(true);
            }}
            onMouseLeave={() => {
              setSettingsHovered(false);
              setSettingsOpen(false);
            }}
          >
            <Link
              href="/admin/settings"
              className="flex items-center gap-2 border-b border-white/10 px-4 py-3 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
            <Link
              href="/api/auth/signout"
              className="flex items-center gap-2 px-4 py-3 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
