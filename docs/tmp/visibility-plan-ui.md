# Visitor Visibility & Action Tracking – UI Implementation Plan

This plan covers the frontend/client-side implementation for the visibility tracking system, following existing codebase patterns.

---

## 1. Visitor Identity Management

### 1.1 VisitorId Cookie Middleware

Extend `middleware.ts` to set/read a `visitorId` cookie for all requests:

```
middleware.ts additions:
- Generate v4 UUID for anonymous visitors on first request
- For authenticated users: hash the userId (from session) as visitorId
- Set cookie: `x-visitor-id` (httpOnly: false so client JS can read it)
- Forward `x-visitor-id` header to origin for API routes
```

**Pattern alignment:** Follows existing middleware auth pattern but adds identity tracking.

### 1.2 VisitorId Client Utility

Create `src/lib/visitor/getVisitorId.ts`:
- Read `x-visitor-id` from document.cookie
- Fallback: generate & store UUID in localStorage (edge case where cookie fails)
- Export `getVisitorId(): string`

---

## 2. Custom Hooks

### 2.1 usePresenceHeartbeat

**File:** `src/hooks/usePresenceHeartbeat.ts`

**Pattern:** Similar to `usePageTransition` – uses `useEffect`, `useRef`, `useCallback`

```typescript
interface UsePresenceHeartbeatOptions {
  intervalMs?: number; // default from env: PRESENCE_HEARTBEAT_SECONDS * 1000
  enabled?: boolean;
}

function usePresenceHeartbeat(options?: UsePresenceHeartbeatOptions): void
```

**Implementation:**
1. On mount: send initial presence ping
2. `setInterval` for heartbeat (default 60s)
3. `visibilitychange` listener: ping on tab focus, mark leaving on hide
4. `beforeunload` listener: sendBeacon for final presence update
5. Cleanup: clear interval, remove listeners

**API call:**
```typescript
POST /api/presence
Body: { route: pathname, title: document.title, ts: Date.now() }
Response: { serverTs: number }
```

**Dependencies:** Uses `usePathname()` from next/navigation, `getVisitorId()` utility.

### 2.2 useEventTracker

**File:** `src/hooks/useEventTracker.ts`

**Pattern:** Returns a memoized emit function, similar to `useHover` pattern.

```typescript
type EventType = 'page_view' | 'nav' | 'click' | 'form_submit' | 'chat_message' | 'download';

interface TrackEvent {
  type: EventType;
  route?: string;
  referrer?: string;
  payload?: Record<string, unknown>; // size-capped by API
}

function useEventTracker(): {
  track: (event: TrackEvent) => void;
  flush: () => Promise<void>;
}
```

**Implementation:**
1. Internal queue (useRef) for batching events
2. Auto-flush when queue reaches 20 events or after 5s debounce
3. `track()` adds event with timestamp to queue
4. `flush()` sends batch to API, clears queue
5. `beforeunload`: sendBeacon for remaining events

**API call:**
```typescript
POST /api/events
Body: { events: TrackEvent[] }
```

### 2.3 usePageViewTracker

**File:** `src/hooks/usePageViewTracker.ts`

**Pattern:** Composition hook that uses `useEventTracker` + `usePathname`.

```typescript
function usePageViewTracker(): void
```

**Implementation:**
1. Track `page_view` on pathname change
2. Include `referrer` from `document.referrer` on initial load
3. Debounce rapid route changes (200ms)

---

## 3. Context Provider

### 3.1 VisitorProvider

**File:** `src/context/VisitorProvider.tsx`

**Pattern:** Follows `AdminProvider` pattern – wraps app, provides context.

```typescript
interface VisitorContextValue {
  visitorId: string | null;
  isPresenceEnabled: boolean;
  isEventsEnabled: boolean;
  track: (event: TrackEvent) => void;
}

const VisitorContext = createContext<VisitorContextValue | null>(null);

function VisitorProvider({ children, config }: {
  children: React.ReactNode;
  config: { presenceEnabled: boolean; eventsEnabled: boolean };
}): JSX.Element

function useVisitor(): VisitorContextValue
```

**Integration point:** Wrap in `src/app/layout.tsx` after existing providers, conditional on env flags.

---

## 4. Layout Integration

### 4.1 Root Layout Changes

**File:** `src/app/layout.tsx`

```typescript
// Add after existing providers, before children
{process.env.NEXT_PUBLIC_PRESENCE_ENABLED === 'true' && (
  <VisitorProvider config={{
    presenceEnabled: process.env.NEXT_PUBLIC_PRESENCE_ENABLED === 'true',
    eventsEnabled: process.env.NEXT_PUBLIC_EVENTS_ENABLED === 'true',
  }}>
    <PresenceHeartbeat />
    <PageViewTracker />
    {children}
  </VisitorProvider>
)}
```

### 4.2 Headless Tracker Components

**File:** `src/components/tracking/PresenceHeartbeat.tsx`

```typescript
'use client';
// Renders null, just runs the hook
function PresenceHeartbeat(): null {
  usePresenceHeartbeat();
  return null;
}
```

**File:** `src/components/tracking/PageViewTracker.tsx`

```typescript
'use client';
function PageViewTracker(): null {
  usePageViewTracker();
  return null;
}
```

---

## 5. Event Instrumentation

### 5.1 Chat Integration

**File:** `src/components/chat/ChatInput.tsx` (or wherever chat submit lives)

Add to existing submit handler:
```typescript
const { track } = useVisitor();
// After successful message send:
track({ type: 'chat_message', payload: { messageLength: message.length } });
```

### 5.2 Download Tracking

**File:** Create `src/components/TrackedDownloadLink.tsx`

```typescript
interface TrackedDownloadLinkProps {
  href: string;
  filename: string;
  children: React.ReactNode;
  className?: string;
}

function TrackedDownloadLink({ href, filename, children, className }: TrackedDownloadLinkProps) {
  const { track } = useVisitor();

  const handleClick = () => {
    track({ type: 'download', payload: { filename, href } });
  };

  return (
    <a href={href} download={filename} onClick={handleClick} className={className}>
      {children}
    </a>
  );
}
```

### 5.3 Key Button Clicks

For important CTAs, add tracking in onClick handlers:
```typescript
track({ type: 'click', payload: { element: 'contact_cta', location: 'header' } });
```

---

## 6. Admin UI – Online Visitors Dashboard

### 6.1 New Admin Page

**File:** `src/app/admin/visitors/page.tsx`

**Pattern:** Follows `PostsTable` pattern – server prefetch, client refresh.

```typescript
export default async function VisitorsPage() {
  const onlineVisitors = await getOnlineVisitors();
  const recentEvents = await getRecentEvents({ limit: 50 });

  return (
    <div className="space-y-8">
      <OnlineVisitorsPanel initialData={onlineVisitors} />
      <RecentEventsTable initialData={recentEvents} />
    </div>
  );
}
```

### 6.2 OnlineVisitorsPanel Component

**File:** `src/components/admin/OnlineVisitorsPanel.tsx`

```typescript
'use client';

interface OnlineVisitor {
  visitorId: string;
  route: string;
  lastSeen: number;
  uaHash: string;
  geo?: string;
}

interface OnlineVisitorsPanelProps {
  initialData: OnlineVisitor[];
}

function OnlineVisitorsPanel({ initialData }: OnlineVisitorsPanelProps) {
  const [visitors, setVisitors] = useState(initialData);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch('/api/admin/online');
      if (res.ok) {
        const data = await res.json();
        setVisitors(data.visitors);
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
          </span>
          {visitors.length} Online Now
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {visitors.map((v) => (
            <div key={v.visitorId} className="flex justify-between text-sm">
              <span className="font-mono text-xs text-muted-foreground">
                {v.visitorId.slice(0, 8)}...
              </span>
              <span>{v.route}</span>
              <span className="text-muted-foreground">
                {formatDistanceToNow(v.lastSeen)} ago
              </span>
            </div>
          ))}
          {visitors.length === 0 && (
            <p className="text-muted-foreground text-sm">No visitors online</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

### 6.3 RecentEventsTable Component

**File:** `src/components/admin/RecentEventsTable.tsx`

```typescript
'use client';

interface TrackedEvent {
  visitorId: string;
  ts: number;
  type: EventType;
  route: string;
  referrer?: string;
  payload?: Record<string, unknown>;
}

interface RecentEventsTableProps {
  initialData: TrackedEvent[];
}

function RecentEventsTable({ initialData }: RecentEventsTableProps) {
  const [events, setEvents] = useState(initialData);
  const [filter, setFilter] = useState<EventType | 'all'>('all');

  const filteredEvents = filter === 'all'
    ? events
    : events.filter(e => e.type === filter);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <div className="flex gap-2">
          {(['all', 'page_view', 'chat_message', 'download', 'click'] as const).map((t) => (
            <Button
              key={t}
              variant={filter === t ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(t)}
            >
              {t === 'all' ? 'All' : t.replace('_', ' ')}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Time</th>
              <th className="text-left py-2">Type</th>
              <th className="text-left py-2">Route</th>
              <th className="text-left py-2">Visitor</th>
            </tr>
          </thead>
          <tbody>
            {filteredEvents.map((event, i) => (
              <tr key={`${event.visitorId}-${event.ts}-${i}`} className="border-b">
                <td className="py-2">{format(event.ts, 'HH:mm:ss')}</td>
                <td className="py-2">
                  <EventTypeBadge type={event.type} />
                </td>
                <td className="py-2 font-mono text-xs">{event.route}</td>
                <td className="py-2 font-mono text-xs text-muted-foreground">
                  {event.visitorId.slice(0, 8)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
```

### 6.4 EventTypeBadge Component

**File:** `src/components/admin/EventTypeBadge.tsx`

```typescript
const eventTypeColors: Record<EventType, string> = {
  page_view: 'bg-blue-500/20 text-blue-400',
  nav: 'bg-gray-500/20 text-gray-400',
  click: 'bg-yellow-500/20 text-yellow-400',
  form_submit: 'bg-purple-500/20 text-purple-400',
  chat_message: 'bg-green-500/20 text-green-400',
  download: 'bg-orange-500/20 text-orange-400',
};

function EventTypeBadge({ type }: { type: EventType }) {
  return (
    <span className={cn('px-2 py-0.5 rounded text-xs', eventTypeColors[type])}>
      {type.replace('_', ' ')}
    </span>
  );
}
```

### 6.5 Admin Header Integration

**File:** `src/components/AdminHeader.tsx`

Add navigation link to existing admin header:
```typescript
{ href: '/admin/visitors', label: 'Visitors', icon: Users }
```

---

## 7. API Routes (Client-Facing)

### 7.1 Presence API

**File:** `src/app/api/presence/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { updatePresence } from '@/server/visitor/presence-store';

const presenceSchema = z.object({
  route: z.string().max(500),
  title: z.string().max(200),
  ts: z.number(),
});

export async function POST(request: NextRequest) {
  const visitorId = request.headers.get('x-visitor-id');
  if (!visitorId) {
    return NextResponse.json({ error: 'Missing visitor ID' }, { status: 400 });
  }

  const body = await request.json();
  const parsed = presenceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const serverTs = await updatePresence(visitorId, parsed.data);
  return NextResponse.json({ serverTs });
}
```

### 7.2 Events API

**File:** `src/app/api/events/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logEvents } from '@/server/visitor/event-store';

const eventSchema = z.object({
  type: z.enum(['page_view', 'nav', 'click', 'form_submit', 'chat_message', 'download']),
  route: z.string().max(500).optional(),
  referrer: z.string().max(1000).optional(),
  payload: z.record(z.unknown()).optional(),
  ts: z.number(),
});

const eventsBodySchema = z.object({
  events: z.array(eventSchema).max(20),
});

export async function POST(request: NextRequest) {
  const visitorId = request.headers.get('x-visitor-id');
  if (!visitorId) {
    return NextResponse.json({ error: 'Missing visitor ID' }, { status: 400 });
  }

  const body = await request.json();
  const parsed = eventsBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  await logEvents(visitorId, parsed.data.events);
  return NextResponse.json({ ok: true });
}
```

### 7.3 Admin Online API

**File:** `src/app/api/admin/online/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { getOnlineVisitors } from '@/server/visitor/presence-store';

export async function GET() {
  const visitors = await getOnlineVisitors();
  return NextResponse.json({ visitors, count: visitors.length });
}
```

---

## 8. Types

**File:** `src/types/visitor.ts`

```typescript
export type EventType =
  | 'page_view'
  | 'nav'
  | 'click'
  | 'form_submit'
  | 'chat_message'
  | 'download';

export interface TrackEvent {
  type: EventType;
  route?: string;
  referrer?: string;
  payload?: Record<string, unknown>;
  ts?: number;
}

export interface OnlineVisitor {
  visitorId: string;
  route: string;
  title: string;
  lastSeen: number;
  uaHash: string;
  geo?: string;
}

export interface TrackedEvent {
  visitorId: string;
  ts: number;
  type: EventType;
  route: string;
  referrer?: string;
  payload?: Record<string, unknown>;
}
```

---

## 9. Environment Variables (Client-Side)

Add to `.env.template`:
```bash
# Visitor Tracking (public - exposed to client)
NEXT_PUBLIC_PRESENCE_ENABLED=false
NEXT_PUBLIC_EVENTS_ENABLED=false
NEXT_PUBLIC_PRESENCE_HEARTBEAT_SECONDS=60
```

---

## 10. File Structure Summary

```
src/
├── app/
│   ├── api/
│   │   ├── presence/route.ts
│   │   ├── events/route.ts
│   │   └── admin/
│   │       └── online/route.ts
│   └── admin/
│       └── visitors/
│           └── page.tsx
├── components/
│   ├── admin/
│   │   ├── OnlineVisitorsPanel.tsx
│   │   ├── RecentEventsTable.tsx
│   │   └── EventTypeBadge.tsx
│   └── tracking/
│       ├── PresenceHeartbeat.tsx
│       ├── PageViewTracker.tsx
│       └── TrackedDownloadLink.tsx
├── context/
│   └── VisitorProvider.tsx
├── hooks/
│   ├── usePresenceHeartbeat.ts
│   ├── useEventTracker.ts
│   └── usePageViewTracker.ts
├── lib/
│   └── visitor/
│       └── getVisitorId.ts
├── server/
│   └── visitor/
│       ├── presence-store.ts
│       └── event-store.ts
└── types/
    └── visitor.ts
```

---

## 11. Implementation Order

1. **Types & utilities** – `src/types/visitor.ts`, `src/lib/visitor/getVisitorId.ts`
2. **Middleware update** – Add visitorId cookie handling to `middleware.ts`
3. **Core hooks** – `usePresenceHeartbeat`, `useEventTracker`, `usePageViewTracker`
4. **Context provider** – `VisitorProvider` with conditional rendering
5. **Tracking components** – Headless `PresenceHeartbeat`, `PageViewTracker`
6. **API routes** – `/api/presence`, `/api/events` (depends on server stores from infra plan)
7. **Layout integration** – Wire up provider in `layout.tsx`
8. **Admin API** – `/api/admin/online`
9. **Admin UI** – Visitors page with `OnlineVisitorsPanel`, `RecentEventsTable`
10. **Instrumentation** – Add tracking to chat, downloads, key CTAs

---

## 12. Testing Considerations

- **Unit tests:** Hook logic (batching, debounce, cleanup)
- **Integration tests:** API routes with mock DynamoDB
- **E2E tests:**
  - Verify heartbeat updates `lastSeen` in presence table
  - Verify `/api/admin/online` returns expected visitor count
  - Verify events are logged on page navigation

---

## 13. Privacy & Performance Notes

- No PII stored: visitorId is hashed userId or anonymous UUID
- Payload size capped at API level (prevent abuse)
- Heartbeat uses `sendBeacon` for unload (non-blocking)
- Event batching reduces API calls (max 20 events per request)
- All tracking disabled by default (env flags)
- Admin-only access to visitor data (existing auth middleware)
