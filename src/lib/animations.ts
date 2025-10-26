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

