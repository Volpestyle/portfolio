'use client';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type TypeWriterProps = {
  baseText: string;
  hoverText?: string;
  speed?: number;
  backspaceSpeed?: number;
  onBaseComplete?: () => void;
  onHoverTextComplete?: (isComplete: boolean) => void;
  className?: string;
  cursorClassName?: string;
  hideCursorOnComplete?: boolean;
};

export function TypeWriter({
  baseText,
  hoverText,
  speed = 100,
  backspaceSpeed = 50,
  onBaseComplete,
  onHoverTextComplete,
  className,
  cursorClassName,
  hideCursorOnComplete = false,
}: TypeWriterProps) {
  const [displayText, setDisplayText] = useState('');
  const [index, setIndex] = useState(0);
  const [isBaseTextComplete, setIsBaseTextComplete] = useState(false);
  const [isBackspacing, setIsBackspacing] = useState(false);
  const [previousHoverText, setPreviousHoverText] = useState<string | undefined>(undefined);
  const [backspacingText, setBackspacingText] = useState<string | undefined>(undefined);
  const [isHoverTextComplete, setIsHoverTextComplete] = useState(false);

  // Reset animation when component unmounts or route changes
  useEffect(() => {
    return () => {
      setDisplayText('');
      setIndex(0);
    };
  }, []);

  useEffect(() => {
    if (!isBaseTextComplete) return;
    const handleTextTransition = () => {
      // when hover text changes, start backspacing
      if (hoverText !== previousHoverText) {
        // keep track of the last different hover text
        setPreviousHoverText(hoverText);
        if (!backspacingText && displayText.length > baseText.length) {
          setIsBackspacing(true);
          setBackspacingText(previousHoverText);
          onHoverTextComplete?.(false);
          setIsHoverTextComplete(false);
        }
      }

      // if we hover what we're backspacing, stop backspacing
      if (hoverText && hoverText === backspacingText) {
        setIsBackspacing(false);
        setBackspacingText(undefined);
      }
    };
    handleTextTransition();
  }, [
    hoverText,
    previousHoverText,
    isBaseTextComplete,
    displayText.length,
    baseText.length,
    backspacingText,
    onHoverTextComplete,
  ]);

  useEffect(() => {
    const baseLength = baseText.length;
    const fullText = hoverText ? baseText + '\n' + hoverText : baseText;

    const typeHoverText = () => {
      // mutate: backspace the hover text
      if (isBackspacing && displayText.length > baseLength) {
        const timer = setTimeout(() => {
          setDisplayText((prev) => prev.slice(0, -1));
        }, backspaceSpeed);
        return timer;
      }

      // state change: hover text has been backspaced
      if (isBackspacing && displayText.length === baseLength) {
        setIsBackspacing(false);
        setBackspacingText(undefined);
        setPreviousHoverText(undefined);
      }

      // mutate: type the hover text
      if (hoverText && !isBackspacing && displayText.length < fullText.length) {
        const timer = setTimeout(() => {
          setDisplayText(fullText.slice(0, displayText.length + 1));
          // state change: the full text is typed
          if (displayText.length + 1 === fullText.length) {
            onHoverTextComplete?.(true);
            setIsHoverTextComplete(true);
          }
        }, speed);
        return timer;
      }
    };

    const typeBaseText = () => {
      // mutate: type the base text
      if (index < baseLength) {
        const timer = setTimeout(() => {
          setDisplayText(baseText.slice(0, index + 1));
          setIndex((prev) => prev + 1);
        }, speed);
        return timer;
      }

      // state change: base text is complete
      if (index >= baseLength) {
        setIsBaseTextComplete(true);
        onBaseComplete?.();
        return;
      }
    };

    const typeText = !isBaseTextComplete ? typeBaseText : typeHoverText;

    const timer = typeText();
    return () => timer && clearTimeout(timer);
  }, [
    index,
    baseText,
    hoverText,
    speed,
    backspaceSpeed,
    isBaseTextComplete,
    displayText,
    isBackspacing,
    onBaseComplete,
    onHoverTextComplete,
  ]);

  const shouldShowCursor =
    isBackspacing || !(hideCursorOnComplete && ((isBaseTextComplete && !hoverText) || isHoverTextComplete));

  return (
    <div className={cn('whitespace-pre-line font-mono', className)}>
      {displayText}
      {shouldShowCursor ? <span className={cn('ml-1 animate-blink', cursorClassName)}>▋</span> : null}
    </div>
  );
}
