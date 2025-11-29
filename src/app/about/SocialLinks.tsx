'use client';

import { motion } from 'framer-motion';
import { siLinkedin, siGithub, siYoutube, siSpotify, siX } from 'simple-icons/icons';
import { useState } from 'react';
import type { ProfileSocialLink } from '@portfolio/chat-contract';

const ICONS: Record<string, { path: string; hex: string }> = {
  x: siX,
  github: siGithub,
  youtube: siYoutube,
  linkedin: siLinkedin,
  spotify: siSpotify,
};

const SocialIcon: React.FC<{ icon: { path: string; hex: string } }> = ({ icon }) => (
  <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor">
    <path d={icon.path} />
  </svg>
);

export function SocialLinks({ links }: { links: readonly ProfileSocialLink[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <div className="flex flex-row items-start justify-start gap-6">
      {links.map((link, i) => {
        const isHovered = hoveredIndex === i;
        const icon = ICONS[link.platform] ?? siGithub;
        return (
          <motion.div
            key={i}
            className="relative flex flex-col items-center gap-2"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.5,
              delay: i * 0.1,
              type: 'spring',
              stiffness: 200,
            }}
            onHoverStart={() => setHoveredIndex(i)}
            onHoverEnd={() => setHoveredIndex(null)}
          >
            <motion.a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center text-white"
              whileHover={{
                scale: 1.15,
                transition: {
                  duration: 0.3,
                  type: 'spring',
                  stiffness: 400,
                  damping: 10,
                },
              }}
              whileTap={{
                scale: 0.9,
              }}
            >
              <motion.div
                animate={{
                  filter: isHovered
                    ? 'brightness(1.5) drop-shadow(0 0 8px rgba(255, 255, 255, 0.6))'
                    : 'brightness(1) drop-shadow(0 0 0px rgba(255, 255, 255, 0))',
                }}
                transition={{
                  duration: 0.2,
                }}
              >
                <SocialIcon icon={icon} />
              </motion.div>
            </motion.a>
            <motion.span
              className="absolute top-8 whitespace-nowrap text-xs text-white"
              initial={{ opacity: 0, y: -5 }}
              animate={{
                opacity: isHovered ? 1 : 0,
                y: isHovered ? 0 : -5,
              }}
              transition={{
                duration: 0.2,
                ease: 'easeOut',
              }}
            >
              {link.label || link.platform}
            </motion.span>
          </motion.div>
        );
      })}
    </div>
  );
}
