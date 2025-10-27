'use client';

import { type ReactNode, useState } from 'react';
import { HydrationBoundary, QueryClient, QueryClientProvider, type DehydratedState } from '@tanstack/react-query';

interface ChatQueryProviderProps {
  children: ReactNode;
  initialState?: DehydratedState;
}

export function ChatQueryProvider({ children, initialState }: ChatQueryProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5, // keep readmes warm during a session
            gcTime: 1000 * 60 * 30,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <HydrationBoundary state={initialState}>{children}</HydrationBoundary>
    </QueryClientProvider>
  );
}
