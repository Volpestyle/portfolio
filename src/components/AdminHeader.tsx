'use client';

import { useState } from 'react';
import { FileText, MessageSquare, Settings, LogOut, FolderGit2 } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { springAnimations } from '@/lib/animations';
import { TransitionLink, usePageTransition } from '@/components/PageTransition';
import Link from 'next/link';
import { HeaderTypewriter } from '@/components/HeaderTypewriter';

const ADMIN_NAV_ITEMS = [
  { href: '/admin', icon: FileText, label: 'posts', expandedWidth: '5rem' },
  { href: '/admin/portfolio', icon: FolderGit2, label: 'portfolio', expandedWidth: '6rem' },
  { href: '/admin/chat-exports', icon: MessageSquare, label: 'chats', expandedWidth: '5rem' },
] as const;

export function AdminHeader() {
  const pathname = usePathname();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsHovered, setSettingsHovered] = useState(false);
  const [adminHoverText, setAdminHoverText] = useState('');

  const clearHoverStates = () => {
    setHoveredIndex(null);
  };

  return (
    <motion.header layout="position" className="relative z-20 border border-white/50 bg-black/70 py-2 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 py-3 sm:px-6">
        {/* Left side: Admin typewriter title that links home */}
        <TransitionLink
          href="/"
          aria-label="Back to site"
          onMouseEnter={() => setAdminHoverText('JCV')}
          onMouseLeave={() => setAdminHoverText('')}
          onFocus={() => setAdminHoverText('JCV')}
          onBlur={() => setAdminHoverText('')}
          className="group inline-flex min-w-[7rem] items-center justify-start rounded px-3 py-1"
        >
          <HeaderTypewriter
            baseTextOverride="Admin"
            hoverText={adminHoverText}
            typeSpeed={90}
            backspaceSpeed={40}
            className="block w-full text-left"
          />
        </TransitionLink>

        {/* Right side: Nav items + Settings */}
        <nav className="flex items-center gap-2" aria-label="Admin navigation">
          {ADMIN_NAV_ITEMS.map(({ href, icon: Icon, label, expandedWidth }, index) => {
            const isActive = pathname === href;
            const isHovered = hoveredIndex === index;
            const isOtherHovered = hoveredIndex !== null && hoveredIndex !== index;
            const shouldDimActive = isActive && isOtherHovered;

            return (
              <motion.div
                key={href}
                animate={{
                  width: isHovered ? expandedWidth : '2.5rem',
                }}
                transition={springAnimations.width}
              >
                <TransitionLink
                  href={href}
                  aria-label={label}
                  className={cn(
                    'group relative inline-flex h-10 w-full items-center justify-center overflow-hidden rounded-full border transition-opacity duration-200',
                    isActive
                      ? 'border-white bg-white text-black'
                      : 'border-white/20 text-white hover:border-white hover:bg-white hover:text-black active:border-white active:bg-white active:text-black',
                    shouldDimActive && 'opacity-50'
                  )}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={clearHoverStates}
                  onFocus={() => setHoveredIndex(index)}
                  onBlur={clearHoverStates}
                >
                  <motion.div
                    animate={{
                      x: isHovered ? 32 : 0,
                      opacity: isHovered ? 0 : 1,
                    }}
                    transition={springAnimations.iconText}
                    className="absolute"
                  >
                    <Icon className={cn('h-5 w-5', isActive ? 'text-black' : '')} />
                  </motion.div>
                  <motion.span
                    animate={{
                      opacity: isHovered ? 1 : 0,
                    }}
                    transition={springAnimations.fade}
                    className={cn('whitespace-nowrap text-sm font-medium', isActive ? 'text-black' : '')}
                  >
                    {label}
                  </motion.span>
                </TransitionLink>
              </motion.div>
            );
          })}

          {/* Settings with dropdown */}
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
        </nav>
      </div>
    </motion.header>
  );
}
