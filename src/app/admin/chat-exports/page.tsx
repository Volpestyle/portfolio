import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { listChatExports } from '@/server/chat/exports';
import { listChatLogMetadata } from '@/server/admin/logs-store';
import type { CombinedExport } from './types';
import { ChatExportsClient } from './ChatExportsClient';

export const metadata = {
  title: 'Chat Exports',
};

export const dynamic = 'force-dynamic';

export default async function ChatExportsPage() {
  let initialExports: CombinedExport[] | undefined;
  let initialError: string | null = null;

  try {
    const [exportsData, metadata] = await Promise.all([
      listChatExports({ includeDownloadUrl: true }),
      listChatLogMetadata(),
    ]);

    const metadataMap = new Map(metadata.map((m) => [m.filename, m]));
    initialExports = exportsData.map((exp) => {
      const filename = exp.key.split('/').filter(Boolean).pop() ?? exp.key;
      return {
        ...exp,
        metadata: metadataMap.get(filename),
      };
    });
  } catch (error) {
    console.error('[admin/chat-exports] Failed to prefetch exports', error);
    initialExports = [];
    initialError = 'Failed to load exports';
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Chat Exports</h1>
          <p className="mt-1 text-sm text-white/60">
            Download exported chat transcripts saved from the production chatbot.
          </p>
        </div>
        <Button variant="onBlack" asChild>
          <a href="/api/admin/chat-exports" target="_blank" rel="noreferrer">
            API
          </a>
        </Button>
      </div>

      <Card className="border-white/20 bg-black/40 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-white">Saved Exports</CardTitle>
        </CardHeader>
        <CardContent>
          <ChatExportsClient initialExports={initialExports} initialError={initialError} />
        </CardContent>
      </Card>
    </div>
  );
}
