import { useAdminContext } from '@/context/AdminContext';

/**
 * Client-side hook to check if current user is an admin.
 * Relies on server-evaluated admin status injected during SSR/hydration.
 */
export function useIsAdmin(): boolean {
  const { isAdmin } = useAdminContext();
  return isAdmin;
}
