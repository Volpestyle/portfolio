import { useState, useCallback, useEffect } from 'react';
import { useHover } from '@/context/HoverContext';

interface UseAutoCycleProps {
    texts: string[];
    isBaseTextComplete: boolean;
    hoverTextComplete: boolean;
    isTouch: boolean;
    interval?: number;
}

export function useAutoCycle({
    texts,
    isBaseTextComplete,
    hoverTextComplete,
    isTouch,
    interval = 1500
}: UseAutoCycleProps) {
    const { hoverText, setHoverText } = useHover();
    const [activeIndex, setActiveIndex] = useState<number | null>(null);

    useEffect(() => {
        const shouldCycle = isTouch && isBaseTextComplete && (hoverText ? hoverTextComplete : true);

        if (shouldCycle) {
            const timeoutId = setTimeout(() => {
                const nextIndex = activeIndex === null ? 0 : (activeIndex + 1) % texts.length;
                setActiveIndex(nextIndex);
                setHoverText(texts[nextIndex]);
            }, interval);

            return () => clearTimeout(timeoutId);
        }
    }, [isTouch, isBaseTextComplete, hoverTextComplete, hoverText, activeIndex, texts, interval, setHoverText]);

    return { activeIndex };
} 