'use client';

import { ReactNode } from 'react';
import { HoverProvider } from '@/context/HoverContext';
import { ChatProvider } from '@/context/ChatContext';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <HoverProvider>
      <ChatProvider>{children}</ChatProvider>
    </HoverProvider>
  );
}
