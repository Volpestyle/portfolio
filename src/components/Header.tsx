'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Mail, MessageSquare, Rocket, User } from 'lucide-react';
import { HeaderTypewriter, resolveHeaderBaseText } from '@/components/HeaderTypewriter';
import { useHover } from '@/context/HoverContext';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { hoverMessages } from '@/constants/messages';
import { motion } from 'framer-motion';
import { springAnimations } from '@/lib/animations';

const NAV_ITEMS = [
  { href: '/', icon: MessageSquare, label: 'chat', message: '', expandedWidth: '4.5rem' },
  { href: '/about', icon: User, label: 'about', message: hoverMessages.about, expandedWidth: '5rem' },
  { href: '/projects', icon: Rocket, label: 'projects', message: hoverMessages.projects, expandedWidth: '6.5rem' },
  { href: '/blog', icon: BookOpen, label: 'blog', message: hoverMessages.blog, expandedWidth: '4.5rem' },
  { href: '/contact', icon: Mail, label: 'contact', message: hoverMessages.contact, expandedWidth: '6rem' },
] as const;

export function Header() {
  const { setHoverText } = useHover();
  const pathname = usePathname();
  const [headerHoverText, setHeaderHoverText] = useState('');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    setHeaderHoverText('');
  }, [pathname]);

  const clearHoverStates = () => {
    setHoverText('');
    setHeaderHoverText('');
    setHoveredIndex(null);
  };

  return (
    <motion.header layout="position" className="relative z-20 border border-white/50 bg-black/70 py-2 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-4">
          <Link href="/" aria-label="Home">
            <HeaderTypewriter hoverText={headerHoverText} />
          </Link>
        </div>

        <nav className="flex items-center gap-2" aria-label="Primary">
          {NAV_ITEMS.map(({ href, icon: Icon, label, message, expandedWidth }, index) => {
            const isActive = pathname === href;
            const headerCopy = resolveHeaderBaseText(href);
            const isHovered = hoveredIndex === index;

            const setHoverStates = () => {
              setHoverText(message);
              setHeaderHoverText(headerCopy);
              setHoveredIndex(index);
            };

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
                <Link
                  href={href}
                  aria-label={label}
                  className={cn(
                    'group relative inline-flex h-10 w-full items-center justify-center overflow-hidden rounded-full border transition-opacity duration-200',
                    isActive
                      ? 'border-white bg-white text-black'
                      : 'border-white/20 text-white hover:border-white hover:bg-white hover:text-black active:border-white active:bg-white active:text-black',
                    shouldDimActive && 'opacity-50'
                  )}
                  onMouseEnter={setHoverStates}
                  onMouseLeave={clearHoverStates}
                  onFocus={setHoverStates}
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
                </Link>
              </motion.div>
            );
          })}
        </nav>
      </div>
    </motion.header>
  );
}
