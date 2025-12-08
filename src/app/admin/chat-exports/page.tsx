import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChatExportsClient } from './ChatExportsClient';

export const metadata = {
  title: 'Chat Exports',
};

export const dynamic = 'force-dynamic';

export default function ChatExportsPage() {
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
          <ChatExportsClient />
        </CardContent>
      </Card>
    </div>
  );
}
