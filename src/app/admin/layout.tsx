import { ReactNode } from 'react';
import Link from 'next/link';

export const metadata = {
  title: {
    default: 'Admin',
    template: '%s | Admin',
  },
  robots: {
    index: false,
    follow: false,
  },
};

interface AdminLayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <div className="fixed inset-0 min-h-screen overflow-auto bg-background text-foreground">
      {/* Admin Navigation */}
      <nav className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="text-lg font-bold transition-colors hover:text-primary">
              Blog Admin
            </Link>
            <Link href="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              ← Back to Site
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/api/auth/signout"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign Out
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content - no additional wrapper needed, inherits from root layout */}
      {children}
    </div>
  );
}
