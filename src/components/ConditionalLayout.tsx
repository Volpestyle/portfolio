'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import AnimatedBackground from '@/components/AnimatedBackground';
import { Header } from '@/components/Header';
import { AnimatedLayout } from '@/components/AnimatedLayout';
import { LoadingOverlay } from '@/components/LoadingOverlay';

interface ConditionalLayoutProps {
  children: ReactNode;
}

export function ConditionalLayout({ children }: ConditionalLayoutProps) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith('/admin');

  if (isAdminRoute) {
    // Admin pages - no wrapper, no padding, no header
    return <main>{children}</main>;
  }

  // Regular pages - full portfolio layout
  return (
    <>
      <AnimatedBackground />
      <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
        <AnimatedLayout>
          <Header />
          <LoadingOverlay spinnerVariant="ring">
            <main className="px-4 py-8 sm:px-8">{children}</main>
          </LoadingOverlay>
        </AnimatedLayout>
      </div>
    </>
  );
}
