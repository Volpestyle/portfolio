import { ReactNode } from 'react';

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
  // Navigation is handled by AdminHeader in ConditionalLayout
  return <>{children}</>;
}
