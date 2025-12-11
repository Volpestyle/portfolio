'use client';

import { useEffect, useState } from 'react';
import { BookOpen, Mail, MessageSquare, Rocket, User } from 'lucide-react';
import { HeaderTypewriter, resolveHeaderBaseText } from '@/components/HeaderTypewriter';
import { useHover } from '@/context/HoverContext';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { hoverMessages } from '@/constants/messages';
import { motion } from 'framer-motion';
import { springAnimations } from '@/lib/animations';
import { TransitionLink, usePageTransition } from '@/components/PageTransition';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useIsMobile } from '@/hooks/useMediaQuery';

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
  const isAdmin = useIsAdmin();
  const [headerHoverText, setHeaderHoverText] = useState('');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tappedIndex, setTappedIndex] = useState<number | null>(null);
  const { headerRef, isExiting } = usePageTransition();
  const brandTarget = isAdmin ? '/admin' : '/';
  const isMobile = useIsMobile();

  // Clear tap state when leaving mobile to avoid stale mobile inline colors/animations
  useEffect(() => {
    if (!isMobile && tappedIndex !== null) {
      setTappedIndex(null);
    }
  }, [isMobile, tappedIndex]);

  useEffect(() => {
    setHeaderHoverText('');
    setTappedIndex(null);
  }, [pathname]);

  const clearHoverStates = () => {
    setHoverText('');
    setHeaderHoverText('');
    setHoveredIndex(null);
  };

  return (
    <motion.header
      ref={headerRef}
      layout="position"
      className="relative z-20 border border-white/50 bg-black/70 px-2 py-2 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between px-2 py-3 sm:px-4">
        <div className="flex items-center gap-4">
          <TransitionLink
            href={brandTarget}
            aria-label={isAdmin ? 'Admin' : 'Home'}
            className="group inline-flex min-w-[7rem] items-center justify-start rounded py-1"
            onMouseEnter={() => {
              if (!isAdmin) return;
              setHeaderHoverText('Admin');
              setHoveredIndex(null);
            }}
            onMouseLeave={() => {
              if (!isAdmin) return;
              setHeaderHoverText('');
            }}
            onFocus={() => {
              if (!isAdmin) return;
              setHeaderHoverText('Admin');
              setHoveredIndex(null);
            }}
            onBlur={() => {
              if (!isAdmin) return;
              setHeaderHoverText('');
            }}
          >
            <HeaderTypewriter
              hoverText={headerHoverText}
              typeSpeed={90}
              backspaceSpeed={40}
              className="block w-full text-left"
            />
          </TransitionLink>
        </div>

        <nav className="flex items-center gap-2" aria-label="Primary">
          {NAV_ITEMS.map(({ href, icon: Icon, label, message, expandedWidth }, index) => {
            const isActive = pathname === href;
            const headerCopy = resolveHeaderBaseText(href);
            const isHovered = hoveredIndex === index;
            const isTapped = tappedIndex === index;
            const tapActive = isMobile && isTapped && !isActive;

            const setHoverStates = () => {
              if (isMobile) return;
              setHoverText(message);
              setHeaderHoverText(headerCopy);
              setHoveredIndex(index);
            };

            const handleTap = () => {
              if (isMobile && !isActive) {
                setTappedIndex(index);
              }
            };

            const isOtherHovered = hoveredIndex !== null && hoveredIndex !== index;
            const shouldDimActive = isActive && isOtherHovered;

            // Mobile: tapped item shows white fill, fading out during exit and back in when active
            const mobileFillOpacity = isMobile ? (isActive ? 1 : tapActive ? (isExiting ? 0 : 1) : 0) : 0;
            const mobileFillTransition = {
              duration: tapActive && !isExiting ? 0.12 : 0.25,
              ease: 'easeOut' as const,
            };
            const targetMobileColor = isMobile ? (mobileFillOpacity > 0 ? '#000' : '#fff') : undefined;
            const iconColorMobile = targetMobileColor;
            const labelColorMobile = targetMobileColor;
            const shouldExpand = !isMobile && isHovered;
            const shouldShowGlass = isMobile && (tapActive || isActive);
            const mobileGlassAnimate = tapActive
              ? { opacity: [0.14, 0.32, 0.18], scale: [0.94, 1.06, 1], filter: ['blur(8px)', 'blur(14px)', 'blur(10px)'] }
              : { opacity: isActive ? 0.12 : 0, scale: 1, filter: 'blur(12px)' };
            const mobileGlassTransition = { duration: tapActive ? 0.45 : 0.3, ease: [0.16, 1, 0.3, 1] as const };
            const mobileBounceScale = isMobile ? (tapActive ? [1, 1.08, 0.96, 1.02, 1] : 1) : 1;
            const mobileBounceTransition = tapActive
              ? { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const }
              : { duration: 0.25, ease: 'easeOut' as const };

            return (
              <motion.div
                key={href}
                animate={{
                  width: shouldExpand ? expandedWidth : '2.5rem',
                  scale: mobileBounceScale,
                }}
                transition={
                  isMobile
                    ? { width: springAnimations.width, scale: mobileBounceTransition }
                    : springAnimations.width
                }
              >
                <TransitionLink
                  href={href}
                  aria-label={label}
                  className={cn(
                    'group relative inline-flex h-10 w-full items-center justify-center overflow-hidden rounded-full border',
                    'transition-opacity duration-200 text-white',
                    (isActive || tapActive) && 'border-white',
                    !isActive && !tapActive && 'border-white/20',
                    isActive && !isMobile && 'bg-white text-black',
                    !isMobile && !isActive && 'hover:border-white hover:bg-white hover:text-black',
                    shouldDimActive && 'opacity-50'
                  )}
                  onMouseEnter={setHoverStates}
                  onMouseLeave={clearHoverStates}
                  onFocus={setHoverStates}
                  onBlur={clearHoverStates}
                  onClick={handleTap}
                >
                  {isMobile && (
                    <>
                      <motion.div
                        className="absolute inset-0 rounded-full bg-white"
                        initial={false}
                        animate={{ opacity: mobileFillOpacity }}
                        transition={mobileFillTransition}
                      />
                      {shouldShowGlass && (
                        <>
                          <motion.div
                            className="pointer-events-none absolute inset-[-6px] rounded-full bg-white/80 blur-lg"
                            initial={false}
                            animate={mobileGlassAnimate}
                            transition={mobileGlassTransition}
                          />
                          <motion.div
                            className="pointer-events-none absolute inset-[-8px] rounded-full blur-xl"
                            style={{
                              background:
                                'radial-gradient(ellipse at 30% 50%, rgba(255,255,255,0.45), rgba(255,255,255,0.12) 55%, rgba(255,255,255,0) 70%)',
                            }}
                            initial={false}
                            animate={{
                              opacity: tapActive ? [0, 0.35, 0] : isActive ? 0.12 : 0,
                              scale: tapActive ? [0.9, 1.04, 1.14] : 1,
                            }}
                            transition={{
                              duration: tapActive ? 0.5 : 0.32,
                              ease: tapActive ? [0.16, 1, 0.3, 1] : 'easeOut',
                            }}
                          />
                        </>
                      )}
                    </>
                  )}
                  <motion.div
                    animate={{
                      x: shouldExpand ? 32 : 0,
                      opacity: shouldExpand ? 0 : 1,
                      ...(isMobile && iconColorMobile ? { color: iconColorMobile } : {}),
                    }}
                    transition={{
                      ...springAnimations.iconText,
                      ...(isMobile ? { color: { duration: 0.2, ease: 'easeOut' } } : {}),
                    }}
                    style={isMobile && iconColorMobile ? { color: iconColorMobile } : undefined}
                    key={`icon-${isMobile ? 'mobile' : 'desktop'}`}
                    className="absolute z-10"
                  >
                    <Icon className="h-5 w-5" />
                  </motion.div>
                  <motion.span
                    animate={{
                      opacity: shouldExpand ? 1 : 0,
                      ...(isMobile && labelColorMobile ? { color: labelColorMobile } : {}),
                    }}
                    transition={{
                      ...springAnimations.fade,
                      ...(isMobile ? { color: { duration: 0.2, ease: 'easeOut' } } : {}),
                    }}
                    style={isMobile && labelColorMobile ? { color: labelColorMobile } : undefined}
                    key={`label-${isMobile ? 'mobile' : 'desktop'}`}
                    className="whitespace-nowrap text-sm font-medium"
                  >
                    {label}
                  </motion.span>
                </TransitionLink>
              </motion.div>
            );
          })}
        </nav>
      </div>
    </motion.header>
  );
}
