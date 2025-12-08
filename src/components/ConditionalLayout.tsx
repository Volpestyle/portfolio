'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import AnimatedBackground from '@/components/AnimatedBackground';
import { AdminBackground } from '@/components/AdminBackground';
import { Header } from '@/components/Header';
import { AdminHeader } from '@/components/AdminHeader';
import { AnimatedLayout } from '@/components/AnimatedLayout';
import { AdminAnimatedLayout } from '@/components/AdminAnimatedLayout';
import { PageTransition, PageTransitionProvider } from '@/components/PageTransition';

interface ConditionalLayoutProps {
  children: ReactNode;
}

export function ConditionalLayout({ children }: ConditionalLayoutProps) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith('/admin');

  if (isAdminRoute) {
    // Admin pages - animated layout with admin-specific components
    return (
      <PageTransitionProvider>
        <AdminBackground />
        <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
          <AdminAnimatedLayout>
            <AdminHeader />
            <PageTransition>
              <main className="px-4 py-8 sm:px-8">{children}</main>
            </PageTransition>
          </AdminAnimatedLayout>
        </div>
      </PageTransitionProvider>
    );
  }

  // Regular pages - full portfolio layout
  return (
    <PageTransitionProvider>
      <AnimatedBackground />
      <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
        <AnimatedLayout>
          <Header />
          <PageTransition>
            <main className="px-4 py-8 sm:px-8">{children}</main>
          </PageTransition>
        </AnimatedLayout>
      </div>
    </PageTransitionProvider>
  );
}
