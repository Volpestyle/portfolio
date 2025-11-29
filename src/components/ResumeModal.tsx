'use client';
import React from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import Modal from './ui/modal';
import { motion } from 'framer-motion';

interface ResumeModalProps {
  resumeFilename: string;
  isOpen: boolean;
  onClose: () => void;
}

const ResumeModal: React.FC<ResumeModalProps> = ({ resumeFilename, isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="flex h-full max-h-[90vh] w-full max-w-6xl flex-col rounded-lg border border-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">my resume</h2>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                onClick={onClose}
                variant="onBlack"
                size="icon"
                className="rounded-full border border-white/20 transition hover:border-white"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </Button>
            </motion.div>
          </div>
          <iframe src={`/resume/${resumeFilename}`} className="w-full grow bg-white" title="Resume" />
        </div>
      </div>
    </Modal>
  );
};

export default ResumeModal;
