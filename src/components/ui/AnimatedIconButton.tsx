'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type AnimatedIconButtonProps = {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  className?: string;
  wrapperClassName?: string;
  size?: 'md' | 'lg';
};

/**
 * Circular icon-only button with subtle hover/tap animation.
 * Mirrors the styling of our other animated controls so the carousel
 * and modal actions feel consistent across the app.
 */
export function AnimatedIconButton({
  icon,
  label,
  onClick,
  className = '',
  wrapperClassName = '',
  size = 'md',
}: AnimatedIconButtonProps) {
  const baseSize = size === 'lg' ? 'h-14 w-14' : 'h-12 w-12';

  return (
    <div className={cn('inline-flex', wrapperClassName)}>
      <motion.button
        type='button'
        aria-label={label}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onClick}
        className={cn(
          'flex items-center justify-center rounded-full border border-white/20 bg-white/10 text-white shadow-lg backdrop-blur-lg transition-colors duration-300 hover:border-white hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
          baseSize,
          className
        )}
      >
        <span className='flex items-center justify-center'>{icon}</span>
      </motion.button>
    </div>
  );
}
