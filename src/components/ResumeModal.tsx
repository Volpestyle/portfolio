'use client';
import React from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { RESUME_CONFIG } from '@/lib/constants';
import Modal from './ui/modal';

interface ResumeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ResumeModal: React.FC<ResumeModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="flex h-full max-h-[90vh] w-full max-w-6xl flex-col rounded-lg border border-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">My Resume</h2>
            <Button onClick={onClose} variant="ghost" className="text-white hover:bg-gray-800">
              <X size={24} />
            </Button>
          </div>
          <iframe src={`/resume/${RESUME_CONFIG.RESUME_FILENAME}`} className="w-full grow bg-white" title="Resume" />
        </div>
      </div>
    </Modal>
  );
};

export default ResumeModal;
