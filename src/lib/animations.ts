/**
 * Reusable animation configurations for Framer Motion
 */

export const springAnimations = {
  /** Spring animation for width changes - smooth and bouncy */
  width: {
    type: 'spring' as const,
    stiffness: 300,
    damping: 25,
  },
  /** Spring animation for icon/text movements */
  iconText: {
    type: 'spring' as const,
    stiffness: 300,
    damping: 20,
  },
  /** Simple fade transition */
  fade: {
    duration: 0.2,
  },
} as const;

/**
 * Transition presets for card state changes (card <-> detail <-> doc)
 */
export const cardTransitions = {
  /** Layout transition for container height/size changes */
  layout: {
    duration: 1,
    ease: [0.16, 1, 0.3, 1] as const,
  },
  /** Quick fade for overlapping content during state change */
  crossfade: {
    duration: 0.2,
    ease: [0.4, 0, 0.2, 1] as const,
  },
} as const;

/**
 * Nav item transition animations for route changes
 * Exit: fade out + slide left | Enter: fade in + slide from right (spring)
 */
export const navItemTransition = {
  /** Spring config for entering items */
  spring: {
    type: 'spring' as const,
    stiffness: 400,
    damping: 28,
    mass: 0.8,
  },
  /** Exit animation duration */
  exitDuration: 0.2,
  /** Stagger delay between items */
  staggerDelay: 0.04,
} as const;

/**
 * Staggered entry animations for lists of items
 */
export const staggerConfig = {
  /** Container variants for staggered children */
  container: {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.05,
      },
    },
  },
  /** Individual item entry animation */
  item: {
    hidden: { opacity: 0, y: 12, scale: 0.97 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.35,
        ease: [0.25, 0.46, 0.45, 0.94],
      },
    },
  },
  /** Section-level stagger for multiple sections */
  section: {
    hidden: { opacity: 0, y: 8 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.3,
        ease: [0.25, 0.46, 0.45, 0.94],
        staggerChildren: 0.1,
        delayChildren: 0.1,
      },
    },
  },
} as const;
