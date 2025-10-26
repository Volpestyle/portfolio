'use client';

import { HoverProvider } from '@/context/HoverContext';
import { DeviceProvider } from '@/context/DeviceContext';
import { ReactNode } from 'react';
import { ChatProvider } from '@/context/ChatContext';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <DeviceProvider>
      <HoverProvider>
        <ChatProvider>{children}</ChatProvider>
      </HoverProvider>
    </DeviceProvider>
  );
}
