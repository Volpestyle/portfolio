import { CHAT_DEBUG_LEVEL, getChatDebugLogs, type ChatDebugLogEntry } from '@portfolio/chat-next-api';
import { summarizeTokenUsage } from '@/lib/chat-debug';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function JsonPreview({ value }: { value: unknown }) {
  if (value === undefined) {
    return <p className="text-sm text-white/60">No data recorded.</p>;
  }
  return (
    <pre className="overflow-x-auto rounded-lg bg-black/30 p-3 text-xs text-emerald-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function LogEntry({ entry }: { entry: ChatDebugLogEntry }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <p className="font-mono text-xs text-white/60">
        [{new Date(entry.timestamp).toLocaleTimeString()}] {entry.event}
      </p>
      {entry.payload ? (
        <pre className="mt-2 overflow-x-auto rounded bg-black/40 p-2 text-[11px] text-white/80">
          {JSON.stringify(entry.payload, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

export default function ChatDebugPage() {
  if (process.env.NODE_ENV === 'production') {
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-6 text-white">
        <h1 className="text-2xl font-semibold">Chat Debug Dashboard</h1>
        <p className="text-sm text-white/70">This page is disabled in production.</p>
      </main>
    );
  }

  const logs = getChatDebugLogs();
  const latestSummary = [...logs].reverse().find((entry) => entry.event === 'chat.pipeline.summary');
  const summaryPayload = (latestSummary?.payload ?? null) as Record<string, unknown> | null;
  const tokenSummary = summarizeTokenUsage(logs);

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6 text-white">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-wide text-white/50">Debug tools</p>
        <h1 className="text-3xl font-semibold">Chat Pipeline Dashboard</h1>
        <p className="text-sm text-white/70">
          Inspect the most recent planner/retrieval/evidence/answer events captured by the in-memory log buffer. Logging
          level: <span className="font-mono">{CHAT_DEBUG_LEVEL}</span>
        </p>
      </header>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Latest pipeline summary</h2>
          <p className="text-sm text-white/70">Full JSON payload from the most recent turn.</p>
        </div>
        {latestSummary ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-sm uppercase tracking-wide text-white/60">Plan</h3>
              <JsonPreview value={summaryPayload?.plan} />
              <h3 className="text-sm uppercase tracking-wide text-white/60">Retrieval</h3>
              <JsonPreview value={summaryPayload?.retrieval} />
            </div>
            <div className="space-y-3">
              <h3 className="text-sm uppercase tracking-wide text-white/60">Evidence</h3>
              <JsonPreview value={summaryPayload?.evidence} />
              <h3 className="text-sm uppercase tracking-wide text-white/60">Answer</h3>
              <JsonPreview value={summaryPayload?.answer} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-white/70">No pipeline summary has been logged yet.</p>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">Token usage</h2>
          <p className="text-sm text-white/70">
            Aggregated from recent <code>chat.pipeline.tokens</code> events.
          </p>
        </div>
        {tokenSummary ? (
          <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm">
            <p>Total prompt tokens: {tokenSummary.totals.prompt.toLocaleString()}</p>
            <p>Total completion tokens: {tokenSummary.totals.completion.toLocaleString()}</p>
            <p>Total tokens: {tokenSummary.totals.total.toLocaleString()}</p>
            <div className="mt-3 space-y-1">
              <p className="text-xs uppercase tracking-wide text-white/60">By stage</p>
              {Object.entries(tokenSummary.byStage).map(([stage, totals]) => (
                <p key={stage} className="font-mono text-xs text-white/80">
                  {stage}: prompt={totals.prompt} completion={totals.completion} total={totals.total}
                </p>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-white/70">No token usage logs recorded.</p>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">Recent events</h2>
          <p className="text-sm text-white/70">Up to the last 50 entries from the local buffer.</p>
        </div>
        {logs.length ? (
          <div className="space-y-3">
            {logs
              .slice(-50)
              .reverse()
              .map((entry) => (
                <LogEntry key={`${entry.timestamp}-${entry.event}`} entry={entry} />
              ))}
          </div>
        ) : (
          <p className="text-sm text-white/70">No logs captured yet.</p>
        )}
      </section>
    </main>
  );
}
