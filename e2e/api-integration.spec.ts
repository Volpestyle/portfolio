import { test, expect, type APIResponse } from '@playwright/test';
import { resolveTestRuntime, buildProjectHeaders } from './utils/runtime-env';

const runtime = resolveTestRuntime();
const baseUrl = runtime.baseUrl;
const repoOwner = process.env.E2E_API_REPO_OWNER;
const repoName = process.env.E2E_API_REPO_NAME;
const docPath = process.env.E2E_API_DOC_PATH;

test.describe('API integration', () => {
  test('portfolio repos endpoint responds with data', async ({ request }) => {
    const response = await request.get(`${baseUrl}/api/github/portfolio-repos`, {
      headers: buildProjectHeaders('api', runtime),
    });
    expect(response.ok()).toBeTruthy();

    const payload = await response.json();
    expect(Array.isArray(payload.starred)).toBeTruthy();
    expect(Array.isArray(payload.normal)).toBeTruthy();
  });

  test('repo info endpoint returns metadata for the configured repo', async ({ request }) => {
    test.skip(!(repoOwner && repoName), 'E2E_API_REPO_OWNER and E2E_API_REPO_NAME are not configured');
    const response = await request.get(`${baseUrl}/api/github/repo-info/${repoOwner}/${repoName}`, {
      headers: buildProjectHeaders('api', runtime),
    });
    expect(response.ok()).toBeTruthy();

    const payload = await response.json();
    expect(payload.name).toBe(repoName);
    expect(payload.owner?.login).toBeTruthy();
  });

  test('document endpoint serves configured doc (optional)', async ({ request }) => {
    test.skip(!(repoOwner && repoName && docPath), 'Document path environment variables not set');
    if (!docPath) {
      throw new Error('Document path configuration is required for this test.');
    }
    const encodedPath = docPath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    const response = await request.get(`${baseUrl}/api/github/document/${repoOwner}/${repoName}/${encodedPath}`, {
      headers: buildProjectHeaders('api', runtime),
    });
    expect(response.ok()).toBeTruthy();

    const payload = await response.json();
    expect(payload.path).toBe(docPath);
    expect(typeof payload.content).toBe('string');
  });

  test('chat endpoint streams staged SSE frames', async ({ request }) => {
    const baseHeaders = {
      'Content-Type': 'application/json',
      ...buildProjectHeaders('api', runtime),
    };
    // When running locally with fixtures, force the E2E header so the server returns the chat fixture stream
    const headers =
      runtime.mode === 'mock'
        ? { ...baseHeaders, 'x-portfolio-test-mode': 'e2e' }
        : baseHeaders;

    const response = await request.post(`${baseUrl}/api/chat`, {
      headers,
      data: {
        messages: [
          {
            role: 'user',
            content: 'integration ping',
          },
        ],
        ownerId: process.env.CHAT_OWNER_ID ?? 'portfolio-owner',
        responseAnchorId: 'integration-anchor',
        conversationId: 'integration-conversation',
        reasoningEnabled: true,
      },
    });

    expect(response.ok()).toBeTruthy();

    const events = await readSseEvents(response);
    expect(events.length, 'SSE stream should emit events').toBeGreaterThan(0);

    const errorEvents = events.filter((event) => event.type === 'error');
    expect(errorEvents.length, 'SSE stream should not include error frames').toBe(0);

    const stageEvents = events.filter((event): event is StageEvent => event.type === 'stage');
    const plannerComplete = stageEvents.find(
      (event) => event.stage === 'planner' && event.status === 'complete'
    );
    const evidenceComplete = stageEvents.find(
      (event) => event.stage === 'evidence' && event.status === 'complete'
    );
    expect(plannerComplete, 'Planner stage should complete').toBeDefined();
    expect(evidenceComplete, 'Evidence stage should complete').toBeDefined();

    const reasoningEvents = events.filter((event): event is ReasoningEvent => event.type === 'reasoning');
    expect(
      reasoningEvents.some((event) => event.stage === 'plan' && event.trace?.plan),
      'Planner reasoning trace should stream'
    ).toBeTruthy();

    const uiEvents = events.filter((event): event is UiEvent => event.type === 'ui');
    expect(uiEvents.length, 'UI hint event should be present').toBeGreaterThan(0);

    const streamedText = events
      .filter(
        (event): event is TokenEvent =>
          event.type === 'token' && (typeof event.token === 'string' || typeof event.delta === 'string')
      )
      .map((event) => event.token ?? event.delta ?? '')
      .join('')
      .trim();
    expect(streamedText.length, 'Chat response should include streamed tokens').toBeGreaterThan(0);

    const doneEvent = events.find((event) => event.type === 'done');
    expect(doneEvent, 'Stream should finish with a done frame').toBeDefined();
  });

  test('send-email endpoint short-circuits in integration mode', async ({ request }) => {
    const response = await request.post(`${baseUrl}/api/send-email`, {
      headers: {
        'Content-Type': 'application/json',
        ...buildProjectHeaders('api', runtime),
      },
      data: {
        name: 'Integration Test',
        email: 'integration@example.com',
        message: 'Verifying contact API in integration mode.',
      },
    });

    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    expect(payload.success).toBeTruthy();
  });
});

type BaseSseEvent = {
  type?: undefined;
  [key: string]: unknown;
};

type TokenEvent = { type: 'token'; token?: string; delta?: string };
type StageEvent = { type: 'stage'; stage?: string; status?: string };
type ReasoningEvent = { type: 'reasoning'; stage?: string; trace?: Record<string, unknown> };
type UiEvent = { type: 'ui'; ui?: Record<string, unknown> };
type DoneEvent = { type: 'done' };
type ErrorEvent = { type: 'error'; error?: unknown };
type ChatSseEvent = TokenEvent | StageEvent | ReasoningEvent | UiEvent | DoneEvent | ErrorEvent | BaseSseEvent;

async function readSseEvents(response: APIResponse): Promise<ChatSseEvent[]> {
  const body = await response.text();
  const chunks = body
    .split(/\r?\n\r?\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const events: ChatSseEvent[] = [];

  for (const chunk of chunks) {
    const lines = chunk.split(/\r?\n/).map((line) => line.trim());
    const dataLines = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.replace(/^data:\s*/, ''))
      .filter(Boolean);

    if (!dataLines.length) {
      continue;
    }

    const payload = dataLines.join('\n');
    if (!payload || payload === '[DONE]') {
      continue;
    }

    try {
      events.push(JSON.parse(payload) as ChatSseEvent);
    } catch {
      // Ignore malformed frames; fixture streams should be well-formed.
    }
  }

  return events;
}
