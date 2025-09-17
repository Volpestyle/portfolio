'use client';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import ResumeModal from '@/components/ResumeModal';
import { RESUME_CONFIG } from '@/lib/constants';

export function AboutClient() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className="mb-4">
        <iframe src={`/resume/${RESUME_CONFIG.RESUME_FILENAME}`} className="mb-4 h-96 w-full"></iframe>
        <Button className="mr-2 bg-white text-black hover:bg-gray-200">
          <a href={`/resume/${RESUME_CONFIG.RESUME_FILENAME}`} download>
            download resume
          </a>
        </Button>
        <Button className="bg-white text-black hover:bg-gray-200" onClick={() => setIsModalOpen(true)}>
          view full screen
        </Button>
      </div>
      <ResumeModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}