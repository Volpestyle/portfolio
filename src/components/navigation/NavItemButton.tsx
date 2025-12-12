'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { springAnimations, navItemTransition } from '@/lib/animations';
import { TransitionLink } from '@/components/PageTransition';
import type { NavItem } from '@/types/navigation';

interface NavItemButtonProps {
  item: NavItem;
  isActive: boolean;
  isHovered: boolean;
  isTapped: boolean;
  isOtherHovered: boolean;
  isMobile: boolean;
  isExiting: boolean;
  supportsMobileAnimations: boolean;
  onHover: () => void;
  onLeave: () => void;
  onTap: () => void;
  /** Index for staggered animation delay */
  index?: number;
  /** Total number of items (for exit stagger calculation) */
  totalItems?: number;
}

export function NavItemButton({
  item,
  isActive,
  isHovered,
  isTapped,
  isOtherHovered,
  isMobile,
  isExiting,
  supportsMobileAnimations,
  onHover,
  onLeave,
  onTap,
  index = 0,
  totalItems = 1,
}: NavItemButtonProps) {
  const { href, icon: Icon, label, expandedWidth } = item;
  const shouldDimActive = isActive && isOtherHovered;
  const useMobileEffects = isMobile && supportsMobileAnimations;
  const tapActive = useMobileEffects && isTapped && !isActive;

  // Mobile: tapped item shows white fill, fading out during exit and back in when active
  const mobileFillOpacity = useMobileEffects ? (isActive ? 1 : tapActive ? (isExiting ? 0 : 1) : 0) : 0;
  const mobileFillTransition = {
    duration: tapActive && !isExiting ? 0.12 : 0.25,
    ease: 'easeOut' as const,
  };
  // IMPORTANT:
  // Avoid inline animated `color` styles for mobile effects. When resizing between breakpoints,
  // Framer can retain previously-animated inline styles and cause unreadable text on desktop.
  // Instead, apply deterministic Tailwind text color classes only in mobile-effects mode.
  const mobileTextClass = useMobileEffects ? (mobileFillOpacity > 0 ? 'text-black' : 'text-white') : undefined;
  const shouldExpand = !isMobile && isHovered;
  const shouldShowGlass = useMobileEffects && (tapActive || isActive);
  const mobileGlassAnimate = tapActive
    ? { opacity: [0.14, 0.32, 0.18], scale: [0.94, 1.06, 1], filter: ['blur(8px)', 'blur(14px)', 'blur(10px)'] }
    : { opacity: isActive ? 0.12 : 0, scale: 1, filter: 'blur(12px)' };
  const mobileGlassTransition = { duration: tapActive ? 0.45 : 0.3, ease: [0.16, 1, 0.3, 1] as const };
  const mobileBounceScale = useMobileEffects ? (tapActive ? [1, 1.08, 0.96, 1.02, 1] : 1) : 1;
  const mobileBounceTransition = tapActive
    ? { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const }
    : { duration: 0.25, ease: 'easeOut' as const };

  // Calculate stagger delays
  const enterDelay = index * navItemTransition.staggerDelay;
  // Exit in reverse order (rightmost exits first) for a true reverse-stagger
  const exitDelay = (totalItems - 1 - index) * navItemTransition.staggerDelay;

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{
        opacity: 1,
        x: 0,
        scale: useMobileEffects ? mobileBounceScale : 1,
        width: shouldExpand ? expandedWidth : '2.5rem',
        transition: {
          // Enter: spring animation with stagger
          opacity: { ...navItemTransition.spring, delay: enterDelay },
          x: { ...navItemTransition.spring, delay: enterDelay },
          // Width changes use the existing spring
          width: springAnimations.width,
          scale: useMobileEffects ? mobileBounceTransition : undefined,
        },
      }}
      exit={{
        opacity: 0,
        // Reverse of enter: slide back to the right (toward initial x)
        x: 30,
        transition: {
          // Exit: same spring feel as enter, with reverse-stagger
          opacity: { ...navItemTransition.spring, delay: exitDelay },
          x: { ...navItemTransition.spring, delay: exitDelay },
        },
      }}
    >
      <TransitionLink
        href={href}
        aria-label={label}
        className={cn(
          'group relative inline-flex h-10 w-full items-center justify-center overflow-hidden rounded-full border',
          'text-white transition-opacity duration-200',
          (isActive || tapActive) && 'border-white',
          !isActive && !tapActive && 'border-white/20',
          isActive && !useMobileEffects && 'bg-white text-black',
          !useMobileEffects && !isActive && 'hover:border-white hover:bg-white hover:text-black',
          shouldDimActive && 'opacity-50'
        )}
        onMouseEnter={onHover}
        onMouseLeave={onLeave}
        onFocus={onHover}
        onBlur={onLeave}
        onClick={onTap}
      >
        {useMobileEffects && (
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
          }}
          transition={{
            ...springAnimations.iconText,
          }}
          className={cn('absolute z-10', mobileTextClass)}
        >
          <Icon className={cn('h-5 w-5', isActive && !useMobileEffects && 'text-black')} />
        </motion.div>
        <motion.span
          animate={{
            opacity: shouldExpand ? 1 : 0,
          }}
          transition={{
            ...springAnimations.fade,
          }}
          className={cn(
            'whitespace-nowrap text-sm font-medium',
            mobileTextClass,
            isActive && !useMobileEffects && 'text-black'
          )}
        >
          {label}
        </motion.span>
      </TransitionLink>
    </motion.div>
  );
}
