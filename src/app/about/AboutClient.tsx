'use client';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import ResumeModal from '@/components/ResumeModal';
import { RESUME_CONFIG } from '@/lib/constants';
import { Download, Maximize2 } from 'lucide-react';
import { motion } from 'framer-motion';

export function AboutClient() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className="mb-4">
        <iframe
          src={`/resume/${RESUME_CONFIG.RESUME_FILENAME}`}
          className="mb-4 h-96 w-full rounded-lg border border-white/20"
          suppressHydrationWarning
        ></iframe>
        <div className="flex gap-2">
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              variant="onBlack"
              size="icon"
              className="rounded-full border border-white/20 transition hover:border-white"
              asChild
            >
              <a href={`/resume/${RESUME_CONFIG.RESUME_FILENAME}`} download aria-label="Download resume">
                <Download className="h-5 w-5" />
              </a>
            </Button>
          </motion.div>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              variant="onBlack"
              size="icon"
              className="rounded-full border border-white/20 transition hover:border-white"
              onClick={() => setIsModalOpen(true)}
              aria-label="View full screen"
            >
              <Maximize2 className="h-5 w-5" />
            </Button>
          </motion.div>
        </div>
      </div>
      <ResumeModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
