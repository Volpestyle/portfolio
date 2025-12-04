import { test, expect } from '@playwright/test';

test.describe('Site flows', () => {
  test('homepage hero renders and chat composer is ready', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/hi, i'm james\./i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByPlaceholder('ask me anything...')).toBeVisible();
  });

  test('header navigation routes to every core section', async ({ page }) => {
    const navTargets: Array<{
      label: RegExp;
      path: string;
      assertion: () => Promise<void>;
    }> = [
      {
        label: /about/i,
        path: '/about',
        assertion: async () => {
          await expect(page.getByText(/i'm a software engineer from chicago/i)).toBeVisible();
        },
      },
      {
        label: /projects/i,
        path: '/projects',
        assertion: async () => {
          await expect(page.getByRole('link', { name: /view details/i }).first()).toBeVisible();
        },
      },
      {
        label: /blog/i,
        path: '/blog',
        assertion: async () => {
          const emptyState = page.getByText(/no blog posts yet/i);
          const readLink = page.getByRole('link', { name: /read article/i }).first();
          await Promise.race([
            emptyState.waitFor({ state: 'visible' }).catch(() => undefined),
            readLink.waitFor({ state: 'visible' }).catch(() => undefined),
          ]);
          if ((await readLink.count()) > 0) {
            await expect(readLink).toBeVisible();
          } else {
            await expect(emptyState).toBeVisible();
          }
        },
      },
      {
        label: /contact/i,
        path: '/contact',
        assertion: async () => {
          await expect(page.getByRole('heading', { name: /chat with me/i })).toBeVisible();
          await expect(page.getByRole('button', { name: /send message/i })).toBeVisible();
        },
      },
    ];

    for (const target of navTargets) {
      await page.goto('/');
      const headerNav = page.getByRole('navigation', { name: /primary/i });
      await Promise.all([
        page.waitForURL(new RegExp(`${target.path}(/)?$`)),
        headerNav.getByRole('link', { name: target.label }).click(),
      ]);
      await target.assertion();
    }
  });

  test('projects listing opens a detailed project page', async ({ page }) => {
    await page.goto('/projects');
    const detailLink = page.getByRole('link', { name: /view details/i }).first();
    await expect(detailLink).toBeVisible();
    await Promise.all([page.waitForURL(/\/projects\/[^/]+/), detailLink.click()]);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(page.getByTestId('markdown-viewer')).toBeVisible();
  });

  test('about page surfaces resume modal controls', async ({ page }) => {
    await page.goto('/about');
    await expect(page.getByRole('heading', { name: /my resume/i }).first()).toBeVisible();
    await page.getByRole('button', { name: /view full screen/i }).click();
    const resumeModal = page.getByRole('dialog');
    await expect(resumeModal).toBeVisible();
    await page.getByRole('button', { name: /close modal/i }).click();
    await expect(resumeModal).toHaveCount(0);
  });

  test('blog listing renders posts or the empty state and article view works', async ({ page }) => {
    await page.goto('/blog');
    const emptyState = page.getByText(/no blog posts yet/i);
    const readLink = page.getByRole('link', { name: /read article/i }).first();

    await Promise.race([
      emptyState.waitFor({ state: 'visible' }).catch(() => undefined),
      readLink.waitFor({ state: 'visible' }).catch(() => undefined),
    ]);

    if ((await readLink.count()) > 0) {
      await Promise.all([page.waitForURL(/\/blog\/[^/]+/), readLink.click()]);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByRole('link', { name: /back to blog/i }).first()).toBeVisible();
    } else {
      await expect(emptyState).toBeVisible();
    }
  });
});
