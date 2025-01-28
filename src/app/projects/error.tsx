'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Projects page error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center space-y-4">
      <h2 className="text-xl font-bold">Something went wrong loading projects</h2>
      <p className="text-sm text-gray-400">{error.message}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
