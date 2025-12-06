import { Page } from '@playwright/test';
import { TEST_DOC_CONTENT, TEST_PROJECT_DETAIL, TEST_REPO } from '@portfolio/test-support/fixtures';

export async function fillContactForm(page: Page) {
  await page.getByPlaceholder('name...').fill('Playwright User');
  await page.getByPlaceholder('email...').fill('playwright@example.com');
  await page.getByPlaceholder('message...').fill('Testing contact flow');
}

export async function mockChatStream(page: Page) {
  const anchorId = 'assistant-fixture';
  const project = TEST_PROJECT_DETAIL;
  const repo = { ...TEST_REPO, name: project.name, owner: { login: 'volpestyle' } };
  const docPath = 'docs/API.md';

  // Deterministic SSE payload mirroring the spec stages + UI hints.
  const frames = [
    { type: 'item', itemId: anchorId, anchorId },
    { type: 'stage', stage: 'planner', status: 'start', itemId: anchorId, anchorId },
    {
      type: 'reasoning',
      stage: 'planner',
      trace: {
        plan: {
          topic: 'featured project',
          queries: [
            { source: 'projects', limit: 5, text: 'featured project highlights' },
            { source: 'resume', limit: 3, text: 'supporting experience context' },
          ],
        },
      },
      itemId: anchorId,
      anchorId,
    },
    {
      type: 'stage',
      stage: 'planner',
      status: 'complete',
      meta: { topic: 'featured project' },
      durationMs: 180,
      itemId: anchorId,
      anchorId,
    },
    { type: 'stage', stage: 'retrieval', status: 'start', itemId: anchorId, anchorId },
    {
      type: 'reasoning',
      stage: 'retrieval',
      trace: {
        retrieval: [
          {
            source: 'projects',
            queryText: 'featured project highlights',
            requestedTopK: 5,
            effectiveTopK: 5,
            numResults: 1,
          },
          {
            source: 'resume',
            queryText: 'supporting experience context',
            requestedTopK: 3,
            effectiveTopK: 3,
            numResults: 0,
          },
        ],
      },
      itemId: anchorId,
      anchorId,
    },
    {
      type: 'stage',
      stage: 'retrieval',
      status: 'complete',
      meta: { docsFound: 1, sources: ['projects', 'resume'] },
      durationMs: 140,
      itemId: anchorId,
      anchorId,
    },
    { type: 'stage', stage: 'answer', status: 'start', itemId: anchorId, anchorId },
    {
      type: 'token',
      token: "Here's a featured project from my portfolio.",
      itemId: anchorId,
      anchorId,
    },
    {
      type: 'ui',
      itemId: anchorId,
      anchorId,
      ui: { showProjects: [project.slug], showExperiences: [], showEducation: [], showLinks: [] },
    },
    {
      type: 'attachment',
      itemId: anchorId,
      anchorId,
      attachment: { type: 'project', id: project.slug, data: project },
    },
    {
      type: 'reasoning',
      stage: 'answer',
      trace: {
        answer: {
          model: 'gpt-5-nano-2025-08-07',
          uiHints: { projects: [project.slug], experiences: [], links: [] },
          thoughts: ['Introduce the featured project', 'Invite the user to open the inline docs'],
          message: "Here's a featured project from my portfolio.",
        },
      },
      itemId: anchorId,
      anchorId,
    },
    { type: 'ui_actions', itemId: anchorId, anchorId, actions: [] },
    { type: 'stage', stage: 'answer', status: 'complete', durationMs: 640, itemId: anchorId, anchorId },
    { type: 'done', itemId: anchorId, anchorId },
  ];

  const body = frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('');

  const projectSummary = {
    id: project.id,
    slug: project.slug,
    name: project.name,
    oneLiner: project.oneLiner,
    description: project.description,
    techStack: project.techStack,
    languages: project.languages,
    tags: project.tags,
    context: project.context,
    githubUrl: project.githubUrl ?? TEST_REPO.html_url,
  };

  await page.route('**/api/projects', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projects: [projectSummary] }),
    });
  });

  await page.route(`**/api/projects/${project.slug}`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, repo, readme: project.readme }),
    });
  });

  await page.route(`**/api/projects/${project.slug}/doc/**`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        document: {
          repoName: project.slug,
          path: docPath,
          title: 'API Reference',
          content: TEST_DOC_CONTENT,
        },
      }),
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
