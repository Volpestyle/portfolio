'use client';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { TypeWriter } from '@/components/TypeWriter';
import { useHover } from '@/context/HoverContext';
import { useDeviceContext } from '@/context/DeviceContext';
import { User, Rocket, Mail } from 'lucide-react';
import { useState } from 'react';
import { useAutoCycle } from '@/hooks/useAutoCycle';
import { useButtonMeasurements } from '@/hooks/useButtonMeasurements';
import { hoverMessages } from '@/constants/messages';

const buttons = [
  {
    href: '/about',
    icon: User,
    label: 'About me',
    hoverText: hoverMessages.about,
  },
  {
    href: '/projects',
    icon: Rocket,
    label: 'My projects',
    hoverText: hoverMessages.projects,
  },
  {
    href: '/contact',
    icon: Mail,
    label: 'Contact me',
    hoverText: hoverMessages.contact,
  },
];

const texts = buttons.map((button) => button.hoverText);

export default function Home() {
  const { hoverText, setHoverText } = useHover();
  const { isTouch } = useDeviceContext();
  const [isBaseTextComplete, setIsBaseTextComplete] = useState(false);
  const [hoverTextComplete, setHoverTextComplete] = useState(false);
  const { buttonWidth, buttonGap, ref } = useButtonMeasurements();

  // if on touch device, cycle through hover texts automatically while underlining the current button
  const { activeIndex } = useAutoCycle({
    texts,
    isBaseTextComplete,
    hoverTextComplete,
    isTouch,
  });

  return (
    <div className="flex h-full min-h-[calc(80vh-5rem)] flex-col items-center justify-center gap-8 text-center">
      <div className="relative h-[60px] w-full px-4 sm:px-0">
        <div className="absolute left-1/2 min-w-[300px] -translate-x-1/2 sm:min-w-[400px]">
          <TypeWriter
            baseText="hi, i'm james."
            hoverText={hoverText}
            onBaseComplete={() => setIsBaseTextComplete(true)}
            onHoverTextComplete={(isComplete) => setHoverTextComplete(isComplete)}
          />
        </div>
      </div>
      <div className="relative flex gap-4" ref={ref}>
        {buttons.map((button, index) => (
          <Button
            key={button.href}
            size="lg"
            className={`relative animate-fade-in border-2 border-white bg-transparent opacity-0 transition-all duration-500 ease-in-out ${
              activeIndex === index ? 'bg-gray-700' : 'hover:bg-gray-700'
            }`}
            asChild
            onMouseEnter={() => !isTouch && setHoverText(button.hoverText)}
            onMouseLeave={() => !isTouch && setHoverText('')}
          >
            <Link href={button.href} aria-label={button.label}>
              <button.icon className="h-5 w-5" />
            </Link>
          </Button>
        ))}
        {/* Mobile underline indicator */}
        {isTouch && buttonWidth > 0 && (
          <div
            className={`absolute -bottom-2 h-0.5 bg-white transition-all duration-500 ease-in-out ${
              activeIndex === null ? 'opacity-0' : 'opacity-100'
            }`}
            style={{
              width: `${buttonWidth}px`,
              transform: `translateX(calc(${activeIndex !== null ? activeIndex : 0} * (${buttonWidth}px + ${buttonGap}px)))`,
            }}
          />
        )}
      </div>
      <div
        className={`mt-2 text-sm text-gray-400 opacity-0 ${
          isTouch && activeIndex !== null ? 'animate-fade-in-pulse' : ''
        }`}
      >
        (tap to explore)
      </div>
    </div>
  );
}
