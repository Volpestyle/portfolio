'use client';

import { HoverProvider } from '@/context/HoverContext';
import { DeviceProvider } from '@/context/DeviceContext';
import { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <DeviceProvider>
      <HoverProvider>{children}</HoverProvider>
    </DeviceProvider>
  );
}
