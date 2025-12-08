'use client';

import { ReactNode } from 'react';
import { HoverProvider } from '@/context/HoverContext';
import { AdminProvider } from '@/context/AdminContext';
import { ChatProvider } from '@/context/ChatContext';

export function Providers({ children, isAdmin }: { children: ReactNode; isAdmin?: boolean }) {
  return (
    <HoverProvider>
      <AdminProvider isAdmin={isAdmin}>
        <ChatProvider>{children}</ChatProvider>
      </AdminProvider>
    </HoverProvider>
  );
}
