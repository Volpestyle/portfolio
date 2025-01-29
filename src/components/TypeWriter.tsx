'use client';
import { useEffect, useState, useCallback } from 'react';

type TypeWriterProps = {
  baseText: string;
  hoverText?: string;
  speed?: number;
  backspaceSpeed?: number;
  onBaseComplete?: () => void;
  onHoverTextComplete?: () => void;
};

/**
 * A component that creates a customized typewriter effect, animating text character by character.
 * Can handle both a base text and hover text.
 * Will backspace to base text when hover text is changed and type new hover text.
 * Will not backspace all the way down to base text if hover text is the same as the previous hover text.
 * Automatically puts a newline between base and hover text.
 *
 * @param {Object} props - The component props
 * @param {string} props.baseText - The initial text to type out
 * @param {string} [props.hoverText] - Optional text to type after the base text (e.g. on hover)
 * @param {number} [props.speed=100] - Speed of typing animation in milliseconds
 * @param {number} [props.backspaceSpeed=50] - Speed of backspace animation in milliseconds
 * @param {() => void} [props.onBaseComplete] - Callback fired when base text finishes typing
 * @param {() => void} [props.onHoverTextComplete] - Callback fired when hover text finishes typing
 *
 * @example
 * ```tsx
 * <TypeWriter
 *   baseText="Hello"
 *   hoverText="World"
 *   speed={100}
 *   onBaseComplete={() => console.log('Base text complete')}
 * />
 * ```
 */
export function TypeWriter({
  baseText,
  hoverText,
  speed = 100,
  backspaceSpeed = 50,
  onBaseComplete,
  onHoverTextComplete,
}: TypeWriterProps) {
  const [displayText, setDisplayText] = useState('');
  const [index, setIndex] = useState(0);
  const [isBaseTextComplete, setIsBaseTextComplete] = useState(false);
  const [isBackspacing, setIsBackspacing] = useState(false);
  const [previousHoverText, setPreviousHoverText] = useState<string | undefined>(undefined);
  const [backspacingText, setBackspacingText] = useState<string | undefined>(undefined);

  // Reset animation when component unmounts or route changes
  useEffect(() => {
    return () => {
      setDisplayText('');
      setIndex(0);
    };
  }, []);

  // Dont backspace if the hover text is the same as the previous hover text
  const handleTextTransition = useCallback(() => {
    if (isBaseTextComplete && hoverText !== previousHoverText) {
      if (displayText.length > baseText.length) {
        setIsBackspacing(true);
        setBackspacingText(previousHoverText);
      }
      setPreviousHoverText(hoverText);
    }

    if (hoverText && hoverText === backspacingText) {
      setIsBackspacing(false);
      setBackspacingText(undefined);
    }
  }, [hoverText, previousHoverText, isBaseTextComplete, displayText.length, baseText.length, backspacingText]);

  useEffect(() => {
    handleTextTransition();
  }, [handleTextTransition]);

  // Main typing effect
  useEffect(() => {
    const baseLength = baseText.length;
    const fullText = hoverText ? baseText + '\n' + hoverText : baseText;

    const typeText = () => {
      // If the base text is not complete, type the base text
      if (!isBaseTextComplete && index < baseLength) {
        const timer = setTimeout(() => {
          setDisplayText(baseText.slice(0, index + 1));
          setIndex((prev) => prev + 1);
        }, speed);
        return timer;
      }

      // Base text is complete
      if (!isBaseTextComplete && index >= baseLength) {
        setIsBaseTextComplete(true);
        onBaseComplete?.();
        return;
      }

      // If the base text is complete, start typing the hover text
      if (isBaseTextComplete) {
        if (isBackspacing && displayText.length > baseLength) {
          const timer = setTimeout(() => {
            setDisplayText((prev) => prev.slice(0, -1));
          }, backspaceSpeed);
          return timer;
        }

        // one we backspaced down to the base text, stop backspacing
        if (isBackspacing && displayText.length === baseLength) {
          setIsBackspacing(false);
          setBackspacingText(undefined);
        }

        // The full text is typed
        if (hoverText && !isBackspacing && displayText.length < fullText.length) {
          const timer = setTimeout(() => {
            setDisplayText(fullText.slice(0, displayText.length + 1));
            if (displayText.length + 1 === fullText.length) {
              onHoverTextComplete?.();
            }
          }, speed);
          return timer;
        }
      }
    };

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

  return (
    <div className="whitespace-pre-line font-mono text-lg sm:text-xl md:text-2xl">
      {displayText}
      <span className="ml-1 animate-[blink_1s_infinite]">▋</span>
    </div>
  );
}
