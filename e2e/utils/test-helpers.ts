import { Page } from '@playwright/test';

export async function fillContactForm(page: Page) {
  await page.getByPlaceholder('name...').fill('Playwright User');
  await page.getByPlaceholder('email...').fill('playwright@example.com');
  await page.getByPlaceholder('message...').fill('Testing contact flow');
}

export async function mockChatStream(page: Page) {
  const repoFixture = {
    name: 'sample-ai-app',
    description: 'Edge-optimized AI assistant with inline documentation.',
    created_at: '2024-01-01T00:00:00.000Z',
    pushed_at: '2024-02-15T12:00:00.000Z',
    updated_at: '2024-02-15T12:00:00.000Z',
    html_url: 'https://github.com/volpestyle/sample-ai-app',
    owner: { login: 'volpestyle' },
    isStarred: true,
    private: false,
    tags: ['nextjs', 'ai', 'edge'],
    icon: 'rocket',
    languagePercentages: [
      { name: 'TypeScript', percent: 72 },
      { name: 'Rust', percent: 18 },
      { name: 'Python', percent: 10 },
    ],
  };

  // Deterministic SSE payload so chat tests do not rely on real providers.
  const frames = [
    { type: 'item', itemId: 'assistant-item' },
    {
      type: 'token',
      delta: "Here's a featured project and its inline docs.",
      itemId: 'assistant-item',
    },
    {
      type: 'attachment',
      attachment: {
        type: 'project-cards',
        repos: [repoFixture],
      },
      itemId: 'assistant-item',
    },
    {
      type: 'attachment',
      attachment: {
        type: 'project-details',
        repo: repoFixture,
        readme: `# Sample AI App

This assistant streams responses from edge functions and can surface inline documentation.

## Docs
Read the [API Contract](docs/API.md) for payload details.`,
      },
      itemId: 'assistant-item',
    },
    { type: 'done' },
  ];

  const body = frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('');

  await page.route('**/api/chat', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
      },
      body,
    });
  });
}
