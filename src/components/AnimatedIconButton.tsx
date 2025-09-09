'use client';

import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { type LucideIcon } from 'lucide-react';
import { useState } from 'react';

interface AnimatedIconButtonProps {
  href: string;
  icon: LucideIcon;
  text: string;
  external?: boolean;
  disabled?: boolean;
}

export function AnimatedIconButton({
  href,
  icon: Icon,
  text,
  external = false,
  disabled = false,
}: AnimatedIconButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  const buttonClassName = "group relative inline-flex h-10 items-center justify-center overflow-hidden border border-white bg-transparent text-white transition-all duration-300 hover:bg-white hover:text-black";

  const buttonContent = (
    <>
      <span className="absolute whitespace-nowrap text-black opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        {text}
      </span>
      <Icon className="absolute h-5 w-5 transition-all duration-300 group-hover:translate-x-10 group-hover:opacity-0" />
    </>
  );

  const buttonStyle = {
    width: isHovered ? '8rem' : '2.5rem',
    transition: 'width 0.3s ease',
  };

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClassName}
        style={buttonStyle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {buttonContent}
      </a>
    );
  }

  return (
    <Link
      href={href}
      className={buttonClassName}
      style={buttonStyle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {buttonContent}
    </Link>
  );
}