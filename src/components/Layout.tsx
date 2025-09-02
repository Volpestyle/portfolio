'use client';
import React from 'react';
import { usePathname } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useHover } from '@/context/HoverContext';
import { hoverMessages } from '@/constants/messages';
import { useDeviceContext } from '@/context/DeviceContext';
import { ErrorBoundary } from './ErrorBoundary';
import { TanStackQueryDevtools } from './ReactQueryDevtools';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const pathname = usePathname();
  const { setHoverText } = useHover();
  const { isTouch } = useDeviceContext();

  const navItems = [
    { href: '/about', label: 'About', hoverText: hoverMessages.about },
    { href: '/projects', label: 'Projects', hoverText: hoverMessages.projects },
    { href: '/contact', label: 'Contact', hoverText: hoverMessages.contact },
  ];

  const NavButton: React.FC<{ href: string; children: React.ReactNode; hoverText?: string }> = ({
    href,
    children,
    hoverText,
  }) => {
    const isActive = pathname === href;
    return (
      <Button
        variant="onBlack"
        asChild
        className={`${isActive ? 'bg-white bg-opacity-20' : ''} text-sm sm:text-base`}
        onMouseEnter={() => !isTouch && hoverText && setHoverText(hoverText)}
        onMouseLeave={() => {}}
      >
        <Link href={href} prefetch={true}>
          {children}
        </Link>
      </Button>
    );
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="relative z-10 w-full max-w-4xl overflow-hidden border-white bg-black bg-opacity-50 text-white">
        <div className="flex min-h-[80vh] flex-col">
          {/* Navbar */}
          <nav className="flex items-center justify-between border-b border-white p-2 sm:p-4">
            <Link
              href="/"
              prefetch={true}
              className={`text-lg font-bold transition-all hover:opacity-80 sm:text-xl ${pathname === '/' ? 'border-b-2 border-white pb-0.5' : ''}`}
              onClick={() => isTouch && setHoverText(hoverMessages.home)}
              onMouseEnter={() => !isTouch && setHoverText(hoverMessages.home)}
              onMouseLeave={() => {}}
            >
              JCV
            </Link>
            <div className="space-x-1 sm:space-x-4">
              {navItems.map((item) => (
                <NavButton key={item.href} href={item.href} hoverText={item.hoverText}>
                  {item.label}
                </NavButton>
              ))}
            </div>
          </nav>

          <main className="animate-fadeIn grow">
            <ErrorBoundary>{children}</ErrorBoundary>
          </main>
        </div>
      </Card>
      <TanStackQueryDevtools />
    </div>
  );
};

export default Layout;
