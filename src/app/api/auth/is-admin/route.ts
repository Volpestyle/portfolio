import { auth } from '@/auth';
import { isAdminEmail } from '@/lib/auth/allowlist';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await auth();
  const email = session?.user?.email;
  const isAdmin = Boolean(email && isAdminEmail(email));

  return NextResponse.json({ isAdmin });
}
