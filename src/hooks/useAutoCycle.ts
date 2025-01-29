import { useState, useCallback, useEffect } from 'react';
import { useHover } from '@/context/HoverContext';

interface UseAutoCycleProps {
    texts: string[];
    isBaseTextComplete: boolean;
    hoverTextComplete: boolean;
    isTouch: boolean;
    interval?: number;
}

/**
 * Made for TypeWriter component.
 * A custom hook that manages automatic cycling through an array of hover texts.
 * 
 * @param {Object} props - The hook's configuration object
 * @param {string[]} props.texts - Array of texts to cycle through
 * @param {boolean} props.isBaseTextComplete - Flag indicating if the initial text animation is complete
 * @param {boolean} props.isTouch - Flag indicating if the device has touch capabilities
 * @param {number} [props.interval=1500] - Time interval between text changes in milliseconds
 * 
 * @returns {Object} An object containing:
 *   - activeIndex: The current active text index or null
 *   - handleNextCycle: Function to manually trigger the next cycle
 */
export function useAutoCycle({ texts, isBaseTextComplete, hoverTextComplete, isTouch, interval = 1500 }: UseAutoCycleProps) {
    const { hoverText, setHoverText } = useHover();
    const [activeIndex, setActiveIndex] = useState<number | null>(null);

    const updateText = useCallback(
        (index: number) => {
            setActiveIndex(index);
            setHoverText(texts[index]);
        },
        [setHoverText, texts]
    );

    const handleNextCycle = useCallback(() => {
        if (!isTouch || !isBaseTextComplete) return;
        setTimeout(() => {
            setActiveIndex((prev) => (prev === null ? 0 : (prev + 1) % texts.length));
            setHoverText(texts[activeIndex === null ? 0 : (activeIndex + 1) % texts.length]);
        }, interval);
    }, [isTouch, isBaseTextComplete, activeIndex, setHoverText, texts, interval]);

    // Start the cycle when the base text is complete
    useEffect(() => {
        if (!isTouch || !isBaseTextComplete || (hoverText && !hoverTextComplete)) return;

        let currentIndex = 0;

        const cycleText = () => {
            updateText(currentIndex);
            currentIndex = (currentIndex + 1) % texts.length;
        };

        const id = setTimeout(() => cycleText(), interval);

        return () => {
            setHoverText('');
            clearTimeout(id);
        };
    }, [isTouch, updateText, isBaseTextComplete, interval, texts]);

    return {
        activeIndex,
        handleNextCycle
    };
} 