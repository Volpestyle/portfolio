import React from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface ResumeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ResumeModal: React.FC<ResumeModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex justify-center items-center">
      <div className="bg-black border border-white p-4 rounded-lg w-full h-full max-w-6xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-white">My Resume</h2>
          <Button
            onClick={onClose}
            variant="ghost"
            className="text-white hover:bg-gray-800"
          >
            <X size={24} />
          </Button>
        </div>
        <iframe
          src="/resume/jcv-resume-2024.pdf"
          className="flex-grow w-full bg-white"
          title="Resume"
        />
      </div>
    </div>
  );
};

export default ResumeModal;
