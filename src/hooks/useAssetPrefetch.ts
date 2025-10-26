'use client';

import { useCallback, useContext } from 'react';
import { QueryClientContext } from '@tanstack/react-query';

const buildAssetKey = (url: string) => ['asset-prefetch', url];

function loadImage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(url);
    img.onerror = () => reject(new Error(`Failed to load asset: ${url}`));
    img.referrerPolicy = 'no-referrer';
    img.src = url;
  });
}

export function useAssetPrefetch() {
  const queryClient = useContext(QueryClientContext);

  const prefetchAsset = useCallback(
    async (url: string | null | undefined) => {
      if (!queryClient || !url) {
        return;
      }

      return queryClient.ensureQueryData({
        queryKey: buildAssetKey(url),
        queryFn: () => loadImage(url),
        staleTime: 1000 * 60 * 30,
        gcTime: 1000 * 60 * 60,
      });
    },
    [queryClient]
  );

  const isAssetPrefetched = useCallback(
    (url: string | null | undefined) => {
      if (!queryClient || !url) {
        return false;
      }

      return Boolean(queryClient.getQueryData(buildAssetKey(url)));
    },
    [queryClient]
  );

  return { prefetchAsset, isAssetPrefetched };
}
