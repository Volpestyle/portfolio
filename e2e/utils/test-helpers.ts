import { Page } from '@playwright/test';

export async function fillContactForm(page: Page) {
  await page.getByPlaceholder('name...').fill('Playwright User');
  await page.getByPlaceholder('email...').fill('playwright@example.com');
  await page.getByPlaceholder('message...').fill('Testing contact flow');
}

export async function mockChatStream(page: Page) {
  const repoFixture = {
    id: 'sample-ai-app',
    slug: 'sample-ai-app',
    name: 'sample-ai-app',
    oneLiner: 'Edge-optimized AI assistant with inline documentation.',
    description: 'Edge-optimized AI assistant with inline documentation and streaming UI surfaces.',
    techStack: ['Next.js', 'TypeScript', 'OpenAI'],
    languages: ['TypeScript'],
    tags: ['nextjs', 'ai', 'edge'],
    context: { type: 'personal' as const },
    githubUrl: 'https://github.com/volpestyle/sample-ai-app',
  };

  // Deterministic SSE payload so chat tests do not rely on real providers.
  const frames = [
    { type: 'item', itemId: 'assistant-item' },
    {
      type: 'token',
      token: "Here's a featured project and its inline docs.",
      itemId: 'assistant-item',
    },
    {
      type: 'ui',
      itemId: 'assistant-item',
      ui: { showProjects: [repoFixture.id], showExperiences: [] },
    },
    { type: 'done' },
  ];

  const body = frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('');

  const projectSummary = {
    id: repoFixture.id,
    slug: repoFixture.slug,
    name: repoFixture.name,
    oneLiner: repoFixture.oneLiner,
    description: repoFixture.description,
    techStack: repoFixture.techStack,
    languages: repoFixture.languages,
    tags: repoFixture.tags,
    context: repoFixture.context,
    githubUrl: repoFixture.githubUrl,
  };

  await page.route('**/api/projects', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projects: [projectSummary] }),
    });
  });

  await page.route('**/api/resume', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: [] }),
    });
  });

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
