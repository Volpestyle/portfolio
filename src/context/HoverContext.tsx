'use client';
import { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';

interface HoverContextType {
  hoverText: string;
  setHoverText: (text: string) => void;
}

const HoverContext = createContext<HoverContextType | undefined>(undefined);

export function HoverProvider({ children }: { children: ReactNode }) {
  const [hoverText, setHoverText] = useState('');

  const value = useMemo(
    () => ({
      hoverText,
      setHoverText,
    }),
    [hoverText]
  );

  return <HoverContext.Provider value={value}>{children}</HoverContext.Provider>;
}

export function useHover() {
  const context = useContext(HoverContext);
  if (context === undefined) {
    throw new Error('useHover must be used within a HoverProvider');
  }
  return context;
}
