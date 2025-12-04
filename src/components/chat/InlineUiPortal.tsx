'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type InlineUiPortalContextValue = {
  registerAnchor: (anchorId: string, element: HTMLElement) => void;
  unregisterAnchor: (anchorId: string, element: HTMLElement) => void;
  getAnchor: (anchorId?: string | null) => HTMLElement | null;
};

const InlineUiPortalContext = createContext<InlineUiPortalContextValue | null>(null);

export function InlineUiPortalProvider({ children }: { children: ReactNode }) {
  const anchorsRef = useRef(new Map<string, HTMLElement[]>());
  const [version, setVersion] = useState(0);

  const registerAnchor = useCallback((anchorId: string, element: HTMLElement) => {
    if (!anchorId || !element) {
      return;
    }
    const list = anchorsRef.current.get(anchorId) ?? [];
    if (list.includes(element)) {
      return;
    }
    anchorsRef.current.set(anchorId, [...list, element]);
    setVersion((value) => value + 1);
  }, []);

  const unregisterAnchor = useCallback((anchorId: string, element: HTMLElement) => {
    if (!anchorId) {
      return;
    }
    const list = anchorsRef.current.get(anchorId);
    if (!list?.length) {
      return;
    }
    const filtered = list.filter((entry) => entry !== element);
    if (filtered.length) {
      anchorsRef.current.set(anchorId, filtered);
    } else {
      anchorsRef.current.delete(anchorId);
    }
    setVersion((value) => value + 1);
  }, []);

  const getAnchor = useCallback((anchorId?: string | null) => {
    if (!anchorId) {
      return null;
    }
    const list = anchorsRef.current.get(anchorId);
    return list?.[0] ?? null;
  }, []);

  const value = useMemo<InlineUiPortalContextValue>(
    () => ({ registerAnchor, unregisterAnchor, getAnchor }),
    [getAnchor, registerAnchor, unregisterAnchor, version]
  );

  return <InlineUiPortalContext.Provider value={value}>{children}</InlineUiPortalContext.Provider>;
}

export function useInlineUiPortal() {
  const context = useContext(InlineUiPortalContext);
  if (!context) {
    throw new Error('InlineUiPortal components must be rendered under InlineUiPortalProvider');
  }
  return context;
}

export function InlineUiPortalAnchor({ anchorId, className }: { anchorId?: string | null; className?: string }) {
  const { registerAnchor, unregisterAnchor } = useInlineUiPortal();
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const idRef = useRef<string | null>(null);

  const attach = useCallback(() => {
    const node = nodeRef.current;
    if (!node || !anchorId) {
      return;
    }
    registerAnchor(anchorId, node);
    idRef.current = anchorId;
  }, [anchorId, registerAnchor]);

  const detach = useCallback(() => {
    const node = nodeRef.current;
    if (!node || !idRef.current) {
      return;
    }
    unregisterAnchor(idRef.current, node);
    idRef.current = null;
  }, [unregisterAnchor]);

  const refCallback = useCallback(
    (node: HTMLDivElement | null) => {
      if (nodeRef.current) {
        detach();
      }
      nodeRef.current = node;
      if (!node) {
        return;
      }
      attach();
    },
    [attach, detach]
  );

  return <div ref={refCallback} className={cn('w-full', className)} data-inline-ui-anchor />;
}
