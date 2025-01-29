'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { HoverProvider } from '@/context/HoverContext';
import { DeviceProvider } from '@/context/DeviceContext';
import { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <DeviceProvider>
        <HoverProvider>{children}</HoverProvider>
      </DeviceProvider>
    </QueryClientProvider>
  );
}
