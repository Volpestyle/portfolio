'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { HeaderTypewriter, resolveHeaderBaseText } from '@/components/HeaderTypewriter';
import { useHover } from '@/context/HoverContext';
import { usePageTransition, TransitionLink } from '@/components/PageTransition';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { getNavConfig, resolveNavConfigId } from '@/config/navigation';
import { navItemTransition } from '@/lib/animations';
import { NavItemButton } from './NavItemButton';
import { AdminSettingsDropdown } from './AdminSettingsDropdown';
import type { NavItem } from '@/types/navigation';

export function UnifiedHeader() {
  const { setHoverText } = useHover();
  const pathname = usePathname();
  const isAdmin = useIsAdmin();
  const isMobile = useIsMobile();
  const { headerRef, isExiting } = usePageTransition();

  // Determine current nav config based on route
  const navConfigId = useMemo(() => resolveNavConfigId(pathname), [pathname]);
  const navConfig = useMemo(() => getNavConfig(pathname), [pathname]);
  const prevNavConfigId = useRef(navConfigId);

  // Header typewriter state
  const [headerHoverText, setHeaderHoverText] = useState('');

  // Nav item interaction states
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tappedIndex, setTappedIndex] = useState<number | null>(null);

  // Clear interaction states when nav config changes
  useEffect(() => {
    if (navConfigId !== prevNavConfigId.current) {
      prevNavConfigId.current = navConfigId;
      setHoveredIndex(null);
      setTappedIndex(null);
      setHeaderHoverText('');
    }
  }, [navConfigId]);

  // Clear tap state when leaving mobile
  useEffect(() => {
    if (!isMobile && tappedIndex !== null) {
      setTappedIndex(null);
    }
  }, [isMobile, tappedIndex]);

  // Reset interaction state on breakpoint flips (prevents "stuck" hover/tap after resizing)
  useEffect(() => {
    if (navConfig.useHoverContext) {
      setHoverText('');
    }
    setHeaderHoverText('');
    setHoveredIndex(null);
    setTappedIndex(null);
  }, [isMobile, navConfig.useHoverContext, setHoverText]);

  // Reset hover states on route change within same nav
  useEffect(() => {
    setHeaderHoverText('');
    setTappedIndex(null);
  }, [pathname]);

  const clearHoverStates = () => {
    if (navConfig.useHoverContext) {
      setHoverText('');
    }
    setHeaderHoverText('');
    setHoveredIndex(null);
  };

  // Brand link configuration
  const brandHref = navConfig.brandHref;
  // For base nav, admin users see "Admin" on brand hover
  // For admin nav, use the configured brandHoverText
  const brandHoverTarget = navConfig.id === 'base' && isAdmin ? 'Admin' : navConfig.brandHoverText;

  const handleBrandHover = () => {
    if (brandHoverTarget) {
      setHeaderHoverText(brandHoverTarget);
      setHoveredIndex(null);
    }
  };

  const handleBrandLeave = () => {
    if (brandHoverTarget) {
      setHeaderHoverText('');
    }
  };

  const handleItemHover = (index: number, item: NavItem) => {
    if (isMobile) return;
    if (navConfig.useHoverContext && item.hoverMessage) {
      setHoverText(item.hoverMessage);
    }
    setHeaderHoverText(resolveHeaderBaseText(item.href));
    setHoveredIndex(index);
  };

  const handleItemTap = (index: number, isActive: boolean) => {
    if (isMobile && !isActive && navConfig.supportsMobileAnimations) {
      setTappedIndex(index);
    }
  };

  // For admin nav on base routes, link to /admin instead of /
  const actualBrandHref = navConfig.id === 'base' && isAdmin ? '/admin' : brandHref;

  return (
    <motion.header
      ref={headerRef}
      layout="position"
      className="relative z-20 border border-white/50 bg-black/70 px-2 py-2 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between px-2 py-3 sm:px-4">
        {/* Brand / Typewriter */}
        <div className="flex items-center gap-4">
          <TransitionLink
            href={actualBrandHref}
            aria-label={navConfig.id === 'admin' ? 'Back to site' : isAdmin ? 'Admin' : 'Home'}
            className="group inline-flex min-w-[7rem] items-center justify-start rounded py-1"
            onMouseEnter={handleBrandHover}
            onMouseLeave={handleBrandLeave}
            onFocus={handleBrandHover}
            onBlur={handleBrandLeave}
          >
            <HeaderTypewriter
              hoverText={headerHoverText}
              baseTextOverride={navConfig.headerText}
              typeSpeed={90}
              backspaceSpeed={40}
              className="block w-full text-left"
            />
          </TransitionLink>
        </div>

        {/* Navigation Items */}
        <nav className="flex items-center gap-2" aria-label={navConfig.id === 'admin' ? 'Admin navigation' : 'Primary'}>
          {/* When switching between base/admin nav variants, we want a true "swap":
              - old icons animate OUT completely
              - then the new icon set animates IN (no overlap/jank) */}
          <AnimatePresence mode="wait">
            {navConfig.items.map((item, index) => {
              const isActive = pathname === item.href;
              const isHovered = hoveredIndex === index;
              const isTapped = tappedIndex === index;
              const isOtherHovered = hoveredIndex !== null && hoveredIndex !== index;

              return (
                <NavItemButton
                  key={`${navConfig.id}-${item.href}`}
                  item={item}
                  index={index}
                  totalItems={navConfig.items.length}
                  isActive={isActive}
                  isHovered={isHovered}
                  isTapped={isTapped}
                  isOtherHovered={isOtherHovered}
                  isMobile={isMobile}
                  isExiting={isExiting}
                  supportsMobileAnimations={navConfig.supportsMobileAnimations ?? false}
                  onHover={() => handleItemHover(index, item)}
                  onLeave={clearHoverStates}
                  onTap={() => handleItemTap(index, isActive)}
                />
              );
            })}

            {/* Admin trailing element (settings dropdown) - animate in/out with the nav swap */}
            {navConfig.id === 'admin' && (
              <motion.div
                key={`${navConfig.id}-settings`}
                initial={{ opacity: 0, x: 16 }}
                animate={{
                  opacity: 1,
                  x: 0,
                  transition: {
                    opacity: {
                      ...navItemTransition.spring,
                      delay: navConfig.items.length * navItemTransition.staggerDelay,
                    },
                    x: { ...navItemTransition.spring, delay: navConfig.items.length * navItemTransition.staggerDelay },
                  },
                }}
                exit={{
                  opacity: 0,
                  // Reverse of enter: slide back to the right
                  x: 16,
                  transition: {
                    opacity: { ...navItemTransition.spring, delay: 0 },
                    x: { ...navItemTransition.spring, delay: 0 },
                  },
                }}
              >
                <AdminSettingsDropdown />
              </motion.div>
            )}
          </AnimatePresence>
        </nav>
      </div>
    </motion.header>
  );
}
