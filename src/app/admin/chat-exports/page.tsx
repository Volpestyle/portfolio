import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChatExportsClient } from './ChatExportsClient';

export const metadata = {
  title: 'Chat Exports',
};

export const dynamic = 'force-dynamic';

export default function ChatExportsPage() {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide text-muted-foreground">Chat</p>
            <h1 className="text-3xl font-bold tracking-tight">Chat Exports</h1>
            <p className="mt-1 text-muted-foreground">
              Download exported chat transcripts saved from the production chatbot.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin">
              <Button variant="ghost">← Back to blog admin</Button>
            </Link>
            <Button variant="outline" asChild>
              <a href="/api/admin/chat-exports" target="_blank" rel="noreferrer">
                API
              </a>
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Saved Exports</CardTitle>
          </CardHeader>
          <CardContent>
            <ChatExportsClient />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
