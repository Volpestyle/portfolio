'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Mail, MessageSquare, Rocket, User } from 'lucide-react';
import { HeaderTypewriter, resolveHeaderBaseText } from '@/components/HeaderTypewriter';
import { useHover } from '@/context/HoverContext';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { hoverMessages } from '@/constants/messages';
import { motion } from 'framer-motion';

const NAV_ITEMS = [
  { href: '/', icon: MessageSquare, label: 'Home', message: '' },
  { href: '/about', icon: User, label: 'About', message: hoverMessages.about },
  { href: '/projects', icon: Rocket, label: 'Projects', message: hoverMessages.projects },
  { href: '/contact', icon: Mail, label: 'Contact', message: hoverMessages.contact },
] as const;

export function Header() {
  const { setHoverText } = useHover();
  const pathname = usePathname();
  const [headerHoverText, setHeaderHoverText] = useState('');

  useEffect(() => {
    setHeaderHoverText('');
  }, [pathname]);

  const clearHoverStates = () => {
    setHoverText('');
    setHeaderHoverText('');
  };

  return (
    <motion.header layout="position" className="relative z-20 border-b border-white bg-black/50 py-2 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-4">
          <Link href="/" aria-label="Home">
            <HeaderTypewriter hoverText={headerHoverText} />
          </Link>
        </div>

        <nav className="flex items-center gap-2">
          {NAV_ITEMS.map(({ href, icon: Icon, label, message }) => {
            const isActive = pathname === href;
            const headerCopy = resolveHeaderBaseText(href);

            const setHoverStates = () => {
              setHoverText(message);
              setHeaderHoverText(headerCopy);
            };

            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                className={cn(
                  'rounded-full border px-2 py-2 transition',
                  isActive
                    ? 'border-white bg-white text-black'
                    : 'border-white/20 text-white hover:border-white hover:bg-white hover:text-black'
                )}
                onMouseEnter={setHoverStates}
                onMouseLeave={clearHoverStates}
                onFocus={setHoverStates}
                onBlur={clearHoverStates}
              >
                <Icon className="h-5 w-5" />
              </Link>
            );
          })}
        </nav>
      </div>
    </motion.header>
  );
}
