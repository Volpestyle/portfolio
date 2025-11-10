'use client';

import { motion } from 'framer-motion';
import { siLinkedin, siGithub, siYoutube, siSpotify, siX } from 'simple-icons/icons';
import { useState } from 'react';

interface SocialLink {
  name?: string;
  icon: {
    path: string;
    hex: string;
  };
  url: string;
}

const SocialIcon: React.FC<{ icon: { path: string; hex: string } }> = ({ icon }) => (
  <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor">
    <path d={icon.path} />
  </svg>
);

export function SocialLinks() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const socialLinks: SocialLink[] = [
    {
      name: 'x',
      icon: siX,
      url: 'https://x.com/c0wboyboopbop',
    },
    {
      name: 'github',
      icon: siGithub,
      url: 'https://github.com/Volpestyle',
    },
    {
      name: 'youtube',
      icon: siYoutube,
      url: 'https://www.youtube.com/@vuhlp/videos',
    },
    {
      name: 'linkedn',
      icon: siLinkedin,
      url: 'https://www.linkedin.com/in/james-volpe/',
    },
    {
      name: 'spotify',
      icon: siSpotify,
      url: 'https://open.spotify.com/artist/1s7neYGdYg0kCnUizWy3bk?si=GMzqI3G0RfialSx1-1NjDg',
    },
  ];

  return (
    <div className="flex flex-row items-start gap-6">
      {socialLinks.map((link, i) => {
        const isHovered = hoveredIndex === i;
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
                <SocialIcon icon={link.icon} />
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
              {link.name}
            </motion.span>
          </motion.div>
        );
      })}
    </div>
  );
}
