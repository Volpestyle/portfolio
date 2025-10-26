1. UX & component map

<Header>
  [ User | Rocket | Mail ]  <-- hover over these
  <HeaderTypewriter />      <-- shows the hover text line in header
</Header>

<Main>
  <HeroTitleTypewriter base="hi, i'm james." />   <-- big, once

  <ChatDock>
    <ChatThread>
      // user bubble (plain text)
      // assistant bubble:
      <TypewriterMessage speed="fast" size="sm" />
      // optional attachments:
      <ProjectCardList variant="chat" />
      <ProjectInlineDetails variant="chat" />  <-- markdown scrollable
    </ChatThread>
    <ChatInput />
  </ChatDock>
</Main>

    •	Header hover and Main chat typing are independent: header hover never steals focus from chat; if the assistant is typing, the header line just idles until hover changes.
    •	Project cards render as rows (one per line).
    •	Markdown viewer uses a chat variant: max-h-[60vh], overflow-y-auto, smaller typography.

⸻

2. Header integration (keep “type on hover”)

Add a compact header and a header‑scoped typewriter:

// app/(site)/layout.tsx (sketch)
import { Header } from '@/components/Header';

export default function RootLayout({ children }) {
return (
<html>
<body className="bg-black text-white">
<Header />
{children}
</body>
</html>
);
}

// components/Header.tsx
'use client';
import Link from 'next/link';
import { User, Rocket, Mail } from 'lucide-react';
import { useHover } from '@/context/HoverContext';
import { HeaderTypewriter } from './HeaderTypewriter';
import { hoverMessages } from '@/constants/messages';

export function Header() {
const { setHoverText } = useHover();
return (
<header className="sticky top-0 z-40 border-b border-white/10 bg-black/60 backdrop-blur">
<div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
<div className="font-mono text-sm opacity-75">
<HeaderTypewriter />{/_ shows hover text here _/}
</div>
<nav className="flex items-center gap-3">
{[
{ href: '/about', icon: User, text: hoverMessages.about, label: 'About' },
{ href: '/projects', icon: Rocket, text: hoverMessages.projects, label: 'Projects' },
{ href: '/contact', icon: Mail, text: hoverMessages.contact, label: 'Contact' },
].map(({ href, icon: Icon, text, label }) => (
<Link
key={href}
href={href}
aria-label={label}
onMouseEnter={() => setHoverText(text)}
onMouseLeave={() => setHoverText('')}
className="rounded p-2 hover:bg-white hover:text-black" >
<Icon className="h-5 w-5" />
</Link>
))}
</nav>
</div>
</header>
);
}

// components/HeaderTypewriter.tsx
'use client';
import { TypeWriter } from '@/components/TypeWriter';
import { useHover } from '@/context/HoverContext';

export function HeaderTypewriter() {
const { hoverText } = useHover();
// Only use hoverText; no base line in header.
return (
<TypeWriter
      baseText=""
      hoverText={hoverText}
      speed={55}
      backspaceSpeed={30}
    />
);
}

Your existing HoverContext keeps working. We’ve simply moved the hover targets to the header.

⸻

3. Landing (main) structure

Replace your home hero with:

// app/page.tsx (core)
'use client';
import ChatDock from '@/components/chat/ChatDock';
import { HeroTitle } from '@/components/HeroTitle';

export default function Home() {
return (
<div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-3xl flex-col items-stretch px-4 pt-10">
<HeroTitle /> {/_ writes "hi, i’m james." once _/}
<ChatDock /> {/_ input + thread grows downward _/}
</div>
);
}

// components/HeroTitle.tsx
'use client';
import { TypeWriter } from '@/components/TypeWriter';
import { useState } from 'react';

export function HeroTitle() {
const [done, setDone] = useState(false);
return (
<div className="mb-4 text-center">
<TypeWriter
baseText="hi, i'm james."
speed={100}
onBaseComplete={() => setDone(true)}
/>
{/_ no secondary hover line in main (hover lives in header now) _/}
</div>
);
}

⸻

4. Assistant messages typed via the same typewriter feel

Your current TypeWriter is designed for baseText + hoverText. For chat bubbles, we want a controlled typewriter that types an arbitrary string quickly. Two small options:
• Option A (recommended): a tiny wrapper that reuses the timing behavior but takes a text prop and types it.
• Option B: extend your TypeWriter with a controlledText prop.

Here’s Option A (non‑breaking):

// components/chat/TypewriterMessage.tsx
'use client';
import { useEffect, useState } from 'react';

export function TypewriterMessage({
text,
speed = 16, // fast for assistant
backspaceSpeed = 25, // rarely used here
className = 'font-mono text-sm leading-6 text-gray-100'
}: { text: string; speed?: number; backspaceSpeed?: number; className?: string }) {
const [display, setDisplay] = useState('');

useEffect(() => {
if (display === text) return;
const id = setTimeout(() => {
const common = commonPrefix(display, text).length;
if (display.length > common) setDisplay((d) => d.slice(0, -1));
else setDisplay(text.slice(0, display.length + 1));
}, display.length > text.length ? backspaceSpeed : speed);
return () => clearTimeout(id);
}, [display, text, speed, backspaceSpeed]);

return (
<div className={className}>
{display}
<span className="ml-1 animate-[blink_1s_infinite]">▋</span>
</div>
);
}
function commonPrefix(a: string, b: string) {
let i=0; while (i<a.length && i<b.length && a[i]===b[i]) i++; return a.slice(0,i);
}

Use it inside the assistant bubble:

// components/chat/ChatThread.tsx (snippet)
import { TypewriterMessage } from './TypewriterMessage';
/_ ... _/
{m.parts.map((p, i) => {
if (p.kind === 'text') {
return (
<TypewriterMessage key={i} text={p.text} />
);
}
// attachments unchanged...
})}

This produces the same cursor/typing vibe as your title, just much faster and smaller.

⸻

5. Chat attachments tuned for a chat context
   • Project rows (not grid):

// components/chat/attachments/ProjectCardList.tsx (adapt of your ProjectCard)
'use client';
import { ProjectCard } from '@/components/ProjectCard';
import type { RepoData } from '@/lib/github-server';
import { useChat } from '@/hooks/useChat';

export function ProjectCardList({ repos }: { repos: RepoData[] }) {
const { openProjectInline } = useChat();
return (
<div className="mt-2 flex flex-col gap-2">
{repos.map((repo) => (
<ProjectCard
key={repo.name}
repo={repo}
variant="chat" // <- add this variant in your ProjectCard (smaller typography, row layout)
onOpen={() => openProjectInline(repo.name)}
/>
))}
</div>
);
}

    •	Inline project details (scrollable markdown, compact):

// components/chat/attachments/ProjectInlineDetails.tsx
'use client';
import type { RepoData } from '@/lib/github-server';
import { ProjectContent } from '@/components/ProjectContent';

export function ProjectInlineDetails({
repo,
readme,
breadcrumbsOverride,
}: { repo: RepoData; readme: string; breadcrumbsOverride?: { label: string; href?: string }[] }) {
return (
<div className="mt-3 overflow-hidden rounded-lg border border-gray-700">
<ProjectContent
pid={repo.name}
readme={readme}
repoInfo={repo}
breadcrumbsOverride={breadcrumbsOverride}
variant="chat" // add this variant: text-sm, max-h-[60vh], overflow-y-auto
/>
</div>
);
}

(You already saw the small diffs to ProjectCard and ProjectContent/MarkdownViewer in the previous message; keep those “chat variants.”)

⸻

6. OpenAI wiring (Responses API • o4-mini • streaming • tools)

6.1 Route handler with streaming

// app/api/chat/route.ts
import OpenAI from 'openai';
import { NextRequest } from 'next/server';
import { buildSystemPrompt } from '@/server/prompt/buildSystemPrompt';
import { tools, toolRouter } from '@/server/tools'; // see 6.2/6.3

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
const { messages }:{ messages: Array<{ role:'user'|'assistant'; content:string }> } = await req.json();

const sys = await buildSystemPrompt(); // includes "About me" + repo inventory

// The Responses API is the primary, streaming-capable API in the JS SDK.
// We enable tool calling by passing our tool definitions.
// (See official docs & client examples for streaming/event iteration.) [oai_citation:2‡OpenAI Platform](https://platform.openai.com/docs/api-reference/responses?utm_source=chatgpt.com)
const stream = await client.responses.create({
model: 'o4-mini',
// Use a developer/system-style instruction for o-series (developer is accepted).
// See o3/o4-mini prompting guide. [oai_citation:3‡OpenAI Cookbook](https://cookbook.openai.com/examples/o-series/o3o4-mini_prompting_guide?utm_source=chatgpt.com)
instructions: sys,
input: messages.map(m => ({ role: m.role, content: m.content })),
tools,
stream: true,
});

// Pipe SSE to the client
const encoder = new TextEncoder();
const readable = new ReadableStream({
async start(controller) {
try {
for await (const event of stream) {
// Text deltas (append to the currently-typing assistant bubble)
if (event.type === 'response.output_text.delta') {
controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', delta: event.delta })}\n\n`));
}

          // Tool calls: gather arguments, run server tool, then send the attachment
          if (event.type === 'response.tool_call') {
            const call = event; // { name, arguments }
            const result = await toolRouter(call); // run our server function
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'attachment', attachment: result })}\n\n`));
          }

          if (event.type === 'response.completed') {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
          }
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: String(err) })}\n\n`));
      } finally {
        controller.close();
      }
    }

});

return new Response(readable, {
headers: {
'Content-Type': 'text/event-stream',
'Cache-Control': 'no-cache, no-transform',
Connection: 'keep-alive',
},
});
}

The OpenAI JS SDK supports client.responses.create({ stream: true }) and async‑iterating events server‑side. (See README “Streaming responses” and the API docs.) ￼

The docs page “Introducing o3 and o4‑mini” confirms o4-mini as an API model. (We cite model info, not private SDK internals.) ￼

The separate “Function Calling Guide” for o‑series explains developer/system prompts and tool use patterns. ￼

6.2 Tool definitions (server)

Use your existing GitHub plumbing; expose as function tools:

// server/tools/index.ts
import type { JSONSchema7 } from 'json-schema'; // or inline shapes
import { listProjects, getReadme, getDoc, navigate } from './github-tools';

// 1) Tool schemas for the Responses API
export const tools = [
{
type: 'function',
function: {
name: 'listProjects',
description: 'Find James’s repos by language/topic.',
parameters: {
type: 'object',
properties: {
language: { type: 'string' },
topic: { type: 'string' },
limit: { type: 'number' }
},
additionalProperties: false
} as JSONSchema7
}
},
{
type: 'function',
function: {
name: 'getReadme',
description: 'Get README + repo metadata for a repo.',
parameters: {
type: 'object',
properties: { repo: { type: 'string' } },
required: ['repo'],
additionalProperties: false
} as JSONSchema7
}
},
{
type: 'function',
function: {
name: 'getDoc',
description: 'Fetch a markdown doc within the repo, e.g. docs/ARCH.md',
parameters: {
type: 'object',
properties: {
repo: { type: 'string' },
path: { type: 'string' }
},
required: ['repo','path'],
additionalProperties: false
} as JSONSchema7
}
},
{
type: 'function',
function: {
name: 'navigate',
description: 'Suggest a section of the portfolio to open',
parameters: {
type: 'object',
properties: { section: { type: 'string', enum: ['about','projects','contact'] } },
required: ['section'],
additionalProperties: false
} as JSONSchema7
}
}
];

// 2) Router that runs the tool and converts to a chat attachment payload
export async function toolRouter(call: { function: { name: string; arguments: string }}) {
const args = JSON.parse(call.function.arguments || '{}');
switch (call.function.name) {
case 'listProjects': {
const repos = await listProjects(args);
return { type: 'project-cards', repos };
}
case 'getReadme': {
const { repo } = args;
const { repo: repoInfo, readme } = await getReadme({ repo });
return { type: 'project-details', repo: repoInfo, readme };
}
case 'getDoc': {
const { repo, path } = args;
const { title, content } = await getDoc({ repo, path });
return { type: 'doc', repoName: repo, path, title, content };
}
case 'navigate': {
const { section } = args;
const map = { about: '/about', projects: '/projects', contact: '/contact' } as const;
return { type: 'link', url: map[section] };
}
default:
throw new Error(`Unknown tool: ${call.function.name}`);
}
}

(Function/tool calling with schemas is supported via the Responses API; see the API reference. ￼)

6.3 GitHub tool impls (reuse your lib)

// server/tools/github-tools.ts
import { getRepos, getRepoByName, getReadmeForRepo, getRawDoc } from '@/lib/github-server';

export async function listProjects({ language, topic, limit = 6 }:{ language?: string; topic?: string; limit?: number }) {
const all = await getRepos();
let filtered = all;
if (language) filtered = filtered.filter(r => r.languages?.includes(language) || r.language === language);
if (topic) filtered = filtered.filter(r => r.topics?.includes(topic));
return filtered.slice(0, limit);
}

export async function getReadme({ repo }:{ repo: string }) {
const repoInfo = await getRepoByName(repo);
const readme = await getReadmeForRepo(repo);
return { repo: repoInfo, readme };
}

export async function getDoc({ repo, path }:{ repo: string; path: string }) {
const content = await getRawDoc(repo, path);
const title = path.split('/').pop() || 'Document';
return { title, content };
}

export function navigate({ section }:{ section:'about'|'projects'|'contact' }) {
const map = { about: '/about', projects: '/projects', contact: '/contact' } as const;
return { url: map[section] };
}

⸻

7. “James Volpe” voice (system/developer prompt)

We’ll generate a developer prompt that bakes in your About and a repo index so the LLM sounds like you and knows what it can pull in via tools.

// server/prompt/buildSystemPrompt.ts
import { getAboutMarkdown } from '@/server/content';
import { getRepos } from '@/lib/github-server';

export async function buildSystemPrompt() {
const about = await getAboutMarkdown(); // e.g. from /content/about.md or the /about page source
const repos = await getRepos();
const repoList = repos
.map(r => `- ${r.name}${r.language ? ` (${r.language})` : ''}${r.topics?.length ? ` — topics: ${r.topics.join(', ')}` : ''}`)
.join('\n');

return [
`You are “James Volpe” in a personal portfolio site. Speak in first person, be concise, friendly, and specific.`,
`When users ask about languages, frameworks, or past work, call the appropriate tool(s) instead of guessing.`,
`Prefer showing concrete repos (listProjects → getReadme when expanding) over generic claims.`,
`If a README links to /docs/* and the user clicks, call getDoc and render it inline with breadcrumbs “README > {doc}”.`,
`If asked to navigate, call navigate and present a short CTA.`,
`Tone: approachable, technically precise, no hype. Use short paragraphs and bullets when helpful.`
,
`ABOUT ME (truth source):\n${about}\n`,
`REPOS AVAILABLE (names, languages, topics):\n${repoList}\n`,
`Do not invent repos or claims. If unsure, say “I might be misremembering—want me to pull it up?” then call a tool.`,
].join('\n\n');
}

o‑series docs treat a developer/system message as the place for these rules; we’re using instructions in the Responses API to pass them. ￼

⸻

8. Client chat hook → typewriter + stream

Append tokens to the current assistant bubble, and the TypewriterMessage will type up to the latest target.

// hooks/useChat.ts (essentials)
'use client';
import { useState } from 'react';
import { ChatMessage } from '@/lib/chat/types';

export function useChat() {
const [messages, setMessages] = useState<ChatMessage[]>([]);
const [isBusy, setBusy] = useState(false);

async function send(text: string) {
const user = { id: crypto.randomUUID(), role: 'user' as const, parts: [{ kind: 'text' as const, text }]};
setMessages(m => [...m, user]);
setBusy(true);

    const res = await fetch('/api/chat', { method: 'POST', body: JSON.stringify({ messages: flatten(messages.concat(user)) })});
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    let assistant = { id: crypto.randomUUID(), role: 'assistant' as const, parts: [{ kind: 'text' as const, text: '' }] };
    setMessages(m => [...m, assistant]);

    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames split by \n\n
      const frames = buffer.split('\n\n'); buffer = frames.pop() || '';
      for (const f of frames) {
        if (!f.startsWith('data:')) continue;
        const evt = JSON.parse(f.slice(5));
        if (evt.type === 'token') {
          // grow the assistant text target
          assistant.parts[0].text += evt.delta;
          setMessages(m => m.map(x => x.id === assistant.id ? { ...assistant } : x));
        } else if (evt.type === 'attachment') {
          assistant.parts.push({ kind: 'attachment', attachment: evt.attachment });
          setMessages(m => m.map(x => x.id === assistant.id ? { ...assistant } : x));
        }
      }
    }
    setBusy(false);

}

// helper to turn ChatMessage[] to the simple {role,content} we posted to the API
function flatten(ms: ChatMessage[]) {
return ms.map(m => ({
role: m.role,
content: m.parts.map(p => p.kind === 'text' ? p.text : '[attachment]').join('\n\n')
}));
}

function openProjectInline(repoName: string) { return send(`/open repo ${repoName}`); }
function openDocInline(repo: string, path: string) { return send(`/open doc ${repo} ${path}`); }

return { messages, send, isBusy, openProjectInline, openDocInline };
}

⸻

9. README → /docs/... interception in chat

In your createMarkdownComponents, intercept repo‑relative doc links when in chat:

function Anchor({ href = '', children, ...props }) {
const { openDocInline } = useChat(); // available in chat
const pid = props?.pid; // pass down the repo name from MarkdownViewer
const isDoc = href && (href.startsWith('docs/') || href.startsWith('/docs/'));
if (isDoc && openDocInline && pid) {
return (
<a href={href} onClick={(e) => { e.preventDefault(); openDocInline(pid, normalizeDocPath(href)); }} className="text-blue-400 hover:underline">
{children}
</a>
);
}
return <Link href={href} className="text-blue-400 hover:underline">{children}</Link>;
}

⸻

10. Security, perf, and fit‑and‑finish
    • Streaming: throttle UI updates (React batching is usually fine) and keep the cursor blink for “alive” feel.
    • Caching: cache READMEs/docs for 60–120s; prefetch README when a project row becomes visible to reduce expansion latency.
    • Sanitization: keep rehype-raw safe—pair with a sanitize schema.
    • Costs/latency: o4-mini is a fast, cost‑efficient reasoning model—good match for a chatty landing page. ￼

⸻

11. Build order (practical)
    1.  Header move: create <Header> with the 3 icons; add <HeaderTypewriter> that reads hoverText.
    2.  Home: replace hero with <HeroTitle /> + <ChatDock />.
    3.  Typewriter bubble: add TypewriterMessage and use it for assistant text.
    4.  Chat variants: finish ProjectCard/ProjectContent/MarkdownViewer variants (row + scrollable).
    5.  Docs links: intercept /docs/\* in markdown when in chat.
    6.  OpenAI integration: add /api/chat streaming route with o4-mini + tools.
    7.  Prompt: implement buildSystemPrompt() that pulls your About and repos.

⸻

12. Reference links (why these choices)
    • Responses API (primary API) & API reference (tools/function calling) and streaming guide. ￼
    • OpenAI JS client examples for streaming (client.responses.create({ stream:true })). ￼
    • o4‑mini model announcement/system card & help center page confirming availability/limits. ￼
    • o3/o4‑mini function calling guide (prompting & developer messages). ￼

⸻

TL;DR
• Header = your icon buttons + a header typewriter that shows the hover line.
• Main = the classic “hi, i’m james.” (typed once) + chat, where assistant replies type fast using the same typewriter vibe.
• Attachments = compact rows + scrollable markdown inline.
• Model = OpenAI o4-mini via Responses API, streaming, with tool calls to your GitHub data.
• Voice = seeded by your About page text + repo index in the system/developer prompt.

If you want, I can hand you a drop‑in /api/chat route and a minimal client hook pinned to the exact OpenAI event names you prefer, but the above scaffolding is enough to wire everything up and keep your site’s distinctive typewriter style.
