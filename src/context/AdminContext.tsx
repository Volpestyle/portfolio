'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

type AdminContextValue = {
  isAdmin: boolean;
};

const AdminContext = createContext<AdminContextValue | undefined>(undefined);

export function AdminProvider({ isAdmin, children }: { isAdmin?: boolean; children: ReactNode }) {
  const value = useMemo<AdminContextValue>(() => ({ isAdmin: Boolean(isAdmin) }), [isAdmin]);
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdminContext(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) {
    return { isAdmin: false };
  }
  return ctx;
}
