import React from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { RESUME_CONFIG } from '@/lib/constants';

interface ResumeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ResumeModal: React.FC<ResumeModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
      <div className="flex h-full max-h-[90vh] w-full max-w-6xl flex-col rounded-lg border border-white bg-black p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">My Resume</h2>
          <Button onClick={onClose} variant="ghost" className="text-white hover:bg-gray-800">
            <X size={24} />
          </Button>
        </div>
        <iframe src={`/resume/${RESUME_CONFIG.RESUME_FILENAME}`} className="w-full flex-grow bg-white" title="Resume" />
      </div>
    </div>
  );
};

export default ResumeModal;
