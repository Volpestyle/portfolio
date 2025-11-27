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
        type: 'spring' as const,
        stiffness: 300,
        damping: 30,
    },
    /** Quick fade for overlapping content during state change */
    crossfade: {
        duration: 0.2,
        ease: [0.4, 0, 0.2, 1] as const,
    },
} as const;

