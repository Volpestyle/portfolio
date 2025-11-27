import { test, expect, type APIResponse } from '@playwright/test';
import { resolveTestRuntime, usingRealApis, buildProjectHeaders } from './utils/runtime-env';

const runtime = resolveTestRuntime();
const useRealApis = usingRealApis(runtime);
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

  test('chat endpoint responds in integration mode without OpenAI', async ({ request }) => {
    const response = await request.post(`${baseUrl}/api/chat`, {
      headers: {
        'Content-Type': 'application/json',
        ...buildProjectHeaders('api', runtime),
      },
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
      },
    });

    expect(response.ok()).toBeTruthy();

    if (useRealApis) {
      const events = await readSseEvents(response);
      expect(events.length, 'SSE stream should emit events').toBeGreaterThan(0);
      const errorEvents = events.filter((event) => event.type === 'error');
      expect(errorEvents.length, 'SSE stream should not include error frames').toBe(0);
      const streamedText = events
        .filter((event) => event.type === 'token' && typeof event.token === 'string')
        .map((event) => event.token as string)
        .join('')
        .trim();
      expect(streamedText.length, 'Chat response should return tokens from the real provider').toBeGreaterThan(0);
      return;
    }

    const payload = await response.json();
    expect(payload.message).toContain('integration');
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

type ChatSseEvent = {
  type?: string;
  token?: string;
};

async function readSseEvents(response: APIResponse): Promise<ChatSseEvent[]> {
  const body = await response.text();
  return body
    .split('\n\n')
    .map((chunk) => chunk.trim())
    .map((chunk) => {
      if (!chunk.startsWith('data:')) {
        return null;
      }
      const payload = chunk.replace(/^data:\s*/, '');
      if (!payload || payload === '[DONE]') {
        return null;
      }
      try {
        return JSON.parse(payload) as ChatSseEvent;
      } catch {
        return null;
      }
    })
    .filter((event): event is ChatSseEvent => Boolean(event));
}
