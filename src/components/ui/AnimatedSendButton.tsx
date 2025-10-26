'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { SendHorizontal } from 'lucide-react';
import { motion } from 'framer-motion';
import { springAnimations } from '@/lib/animations';

interface AnimatedSendButtonProps {
  disabled?: boolean;
  height?: number;
  className?: string;
}

export function AnimatedSendButton({ disabled = false, height = 40, className = '' }: AnimatedSendButtonProps) {
  const [isDesktop, setIsDesktop] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const checkIsDesktop = () => setIsDesktop(window.innerWidth >= 640);
    checkIsDesktop();
    window.addEventListener('resize', checkIsDesktop);
    return () => window.removeEventListener('resize', checkIsDesktop);
  }, []);

  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 1 }}
      transition={springAnimations.width}
      className={`w-full sm:w-auto ${className}`}
      style={isDesktop ? { height: `${height}px` } : { height: '2.5rem' }}
    >
      <Button
        type="submit"
        disabled={disabled}
        variant="onBlack"
        className={`relative flex h-full ${isDesktop ? 'w-16' : 'w-full'} items-center justify-center overflow-hidden rounded-lg border border-white/20 transition-all duration-300 hover:border-white`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-label="Send message"
      >
        <motion.span
          animate={{
            opacity: isHovered ? 1 : 0,
          }}
          transition={springAnimations.fade}
          className="absolute whitespace-nowrap text-black"
        >
          send
        </motion.span>
        <motion.div
          animate={{
            x: isHovered ? 40 : 0,
            opacity: isHovered ? 0 : 1,
          }}
          transition={springAnimations.iconText}
        >
          <SendHorizontal className="h-5 w-5" />
        </motion.div>
      </Button>
    </motion.div>
  );
}
