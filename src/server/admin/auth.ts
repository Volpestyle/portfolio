'use server';

import { headers } from 'next/headers';
import { auth } from '@/auth';
import { isAdminEmail } from '@/lib/auth/allowlist';
import { hasAdminBypass } from '@/lib/test-flags';

export type AdminRequestContext = {
  isAdmin: boolean;
  email: string | null;
  bypass: boolean;
};

export async function getAdminRequestContext(): Promise<AdminRequestContext> {
  const requestHeaders = await headers();
  if (hasAdminBypass(requestHeaders)) {
    return {
      isAdmin: true,
      email: process.env.E2E_ADMIN_BYPASS_EMAIL || 'playwright-admin@example.com',
      bypass: true,
    };
  }

  const session = await auth();
  const email = session?.user?.email ?? null;

  return {
    isAdmin: Boolean(email && isAdminEmail(email)),
    email,
    bypass: false,
  };
}

export async function requireAdminRequest(): Promise<AdminRequestContext> {
  const context = await getAdminRequestContext();
  if (!context.isAdmin) {
    throw new Error('Unauthorized');
  }
  return context;
}
