'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import ResumeModal from '@/components/ResumeModal';
import { Download, Maximize2 } from 'lucide-react';
import { motion } from 'framer-motion';

type AboutClientProps = {
  resumeFilename: string;
};

export function AboutClient({ resumeFilename }: AboutClientProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className="mb-4">
        <iframe
          src={`/resume/${resumeFilename}`}
          className="mb-4 h-96 w-full rounded-lg border border-white/20"
          suppressHydrationWarning
        ></iframe>
        <div className="flex gap-2">
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              variant="onBlack"
              size="icon"
              className="rounded-full border border-white/20 transition hover:border-white active:border-white active:bg-white active:text-black"
              asChild
            >
              <a href={`/resume/${resumeFilename}`} download aria-label="Download resume">
                <Download className="h-5 w-5" />
              </a>
            </Button>
          </motion.div>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              variant="onBlack"
              size="icon"
              className="rounded-full border border-white/20 transition hover:border-white active:border-white active:bg-white active:text-black"
              onClick={() => setIsModalOpen(true)}
              aria-label="View full screen"
            >
              <Maximize2 className="h-5 w-5" />
            </Button>
          </motion.div>
        </div>
      </div>
      <ResumeModal resumeFilename={resumeFilename} isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
