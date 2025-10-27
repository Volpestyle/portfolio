'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { springAnimations } from '@/lib/animations';
import Link from 'next/link';

interface AnimatedExpandButtonProps {
  /** Icon component to display when collapsed */
  icon: ReactNode;
  /** Text to display when expanded */
  text: string;
  /** Width when collapsed (e.g., '2.5rem') */
  collapsedWidth?: string;
  /** Width when expanded (e.g., '8rem') */
  expandedWidth?: string;
  /** Button variant */
  variant?: 'onBlack' | 'default' | 'outline';
  /** Additional classes for the button */
  className?: string;
  /** Wrapper classes for the motion.div */
  wrapperClassName?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Click handler for button */
  onClick?: (e: React.MouseEvent) => void;
  /** Link href - if provided, renders as a link */
  href?: string;
  /** External link */
  external?: boolean;
  /** Render as child (for Link wrapper) */
  asChild?: boolean;
  /** Children to render inside button (overrides icon/text) */
  children?: ReactNode;
}

export function AnimatedExpandButton({
  icon,
  text,
  collapsedWidth = '2.5rem',
  expandedWidth = '8rem',
  variant = 'onBlack',
  className = '',
  wrapperClassName = '',
  disabled = false,
  onClick,
  href,
  external = false,
  asChild = false,
  children,
}: AnimatedExpandButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  const animatedContent = (
    <div className="relative flex h-full w-full items-center justify-center">
      <motion.span
        animate={{
          opacity: isHovered ? 1 : 0,
        }}
        transition={springAnimations.fade}
        className="whitespace-nowrap text-black"
      >
        {text}
      </motion.span>
      <motion.div
        animate={{
          x: isHovered ? 40 : 0,
          opacity: isHovered ? 0 : 1,
        }}
        transition={springAnimations.iconText}
        className="absolute"
      >
        {icon}
      </motion.div>
    </div>
  );

  const buttonClasses = cn(
    'relative h-full w-full overflow-hidden border border-white bg-transparent text-white transition-colors duration-300 hover:border-white hover:bg-white hover:text-black active:border-white active:bg-white active:text-black',
    disabled && 'border-white/20 text-white/50',
    className
  );

  return (
    <motion.div
      className={wrapperClassName}
      style={{ width: collapsedWidth }}
      initial={{ width: collapsedWidth }}
      animate={{
        width: isHovered ? expandedWidth : collapsedWidth,
      }}
      transition={springAnimations.width}
    >
      {children ? (
        // Custom children mode - just wrap it
        <Button
          variant={variant}
          disabled={disabled}
          onClick={onClick}
          asChild={asChild}
          className={buttonClasses}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {children}
        </Button>
      ) : href ? (
        // Link mode
        <Button
          variant={variant}
          disabled={disabled}
          asChild
          className={buttonClasses}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {external ? (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {animatedContent}
            </a>
          ) : (
            <Link href={href}>{animatedContent}</Link>
          )}
        </Button>
      ) : (
        // Button mode
        <Button
          variant={variant}
          disabled={disabled}
          onClick={onClick}
          className={buttonClasses}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {animatedContent}
        </Button>
      )}
    </motion.div>
  );
}
