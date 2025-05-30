import { useLayoutEffect, useRef, useState } from 'react';

interface ButtonMeasurements {
  buttonWidth: number;
  buttonGap: number;
  ref: React.RefObject<HTMLDivElement>;
}

/**
 * A custom hook that measures button dimensions and spacing.
 * Used to calculate positions for UI elements like underline indicators.
 *
 * @returns {ButtonMeasurements} An object containing:
 *   - buttonWidth: The width of a button in pixels
 *   - buttonGap: The gap between buttons in pixels
 *   - ref: A ref object to attach to the button container element
 *
 * @example
 * ```tsx
 * function ButtonGroup() {
 *   const { buttonWidth, buttonGap, ref } = useButtonMeasurements();
 *
 *   return (
 *     <div ref={ref}>
 *       <button>Button 1</button>
 *       <button>Button 2</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useButtonMeasurements(): ButtonMeasurements {
  const ref = useRef<HTMLDivElement>(null);
  const measurements = useRef({ buttonWidth: 0, buttonGap: 0 });

  useLayoutEffect(() => {
    if (!ref.current) return;

    const buttons = ref.current.children;
    if (buttons.length < 2) return;

    const firstButton = buttons[0] as HTMLElement;
    const secondButton = buttons[1] as HTMLElement;
    const buttonWidth = firstButton.offsetWidth;
    const gap = secondButton.offsetLeft - (firstButton.offsetLeft + buttonWidth);

    measurements.current = { buttonWidth, buttonGap: gap };
  }, []); // Empty dependency array as we only need to measure once on mount

  return {
    buttonWidth: measurements.current.buttonWidth,
    buttonGap: measurements.current.buttonGap,
    ref,
  };
}
