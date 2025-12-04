import { test, expect } from '@playwright/test';
import { fillContactForm, mockChatStream } from './utils/test-helpers';
import { resolveTestRuntime, usingRealApis } from './utils/runtime-env';

const runtime = resolveTestRuntime();
const hitsRealApis = usingRealApis(runtime);

test.describe('Engagement surfaces', () => {
  test('contact form requires each field before submission', async ({ page }) => {
    await page.goto('/contact');
    const nameInput = page.locator('input[name="name"]');
    const emailInput = page.locator('input[name="email"]');
    const messageInput = page.locator('textarea[name="message"]');
    const submit = page.getByRole('button', { name: /send message/i });

    await submit.click();
    await expect(nameInput).toBeFocused();
    const nameValidation = await nameInput.evaluate((el) => (el as HTMLInputElement).validationMessage);
    expect(nameValidation.length).toBeGreaterThan(0);

    await nameInput.fill('Playwright User');
    await submit.click();
    await expect(emailInput).toBeFocused();

    await emailInput.fill('invalid');
    await submit.click();
    const emailValidation = await emailInput.evaluate((el) => (el as HTMLInputElement).validationMessage);
    expect(emailValidation.toLowerCase()).toContain('@');

    await emailInput.fill('valid@example.com');
    await submit.click();
    await expect(messageInput).toBeFocused();
  });

  test('contact form shows success toast when the API resolves', async ({ page }) => {
    if (!hitsRealApis) {
      await page.route('**/api/send-email', async (route) => {
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: true }),
        });
      });
    }

    await page.goto('/contact');
    await fillContactForm(page);
    await page.getByRole('button', { name: /send message/i }).click();

    const successToast = page.getByText('Message sent successfully!');
    await expect(successToast).toBeVisible();
    await page.getByRole('button', { name: /dismiss notification/i }).click();
    await expect(successToast).toHaveCount(0);
  });

  test('contact form surfaces server errors', async ({ page }) => {
    await page.route('**/api/send-email', async (route) => {
      await route.fulfill({
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Server error' }),
      });
    });

    await page.goto('/contact');
    await fillContactForm(page);
    await page.getByRole('button', { name: /send message/i }).click();
    await expect(page.getByText(/failed to send message|server error/i)).toBeVisible();
  });

  test('chat streams responses with portfolio surfaces', async ({ page }) => {
    if (!hitsRealApis) {
      await mockChatStream(page);
    }
    await page.goto('/');
    const assistantMessages = page.getByTestId('chat-assistant-message');
    const initialCount = await assistantMessages.count();
    const composer = page.getByPlaceholder('ask me anything...');
    const prompt = hitsRealApis
      ? 'Give me a friendly one-sentence project overview.'
      : 'Tell me about your latest launch.';
    await composer.fill(prompt);
    await page.getByRole('button', { name: /send message/i }).click();
    await expect(assistantMessages).toHaveCount(initialCount + 1, { timeout: 60_000 });
    const latestAssistant = assistantMessages.nth(initialCount);

    await expect(latestAssistant).toBeVisible();

    if (hitsRealApis) {
      const responseText = (await latestAssistant.innerText()).trim();
      expect(responseText.length).toBeGreaterThan(20);
      return;
    }

    // Mocked stream: verify surfaced project detail from UI hints.
    const projectHeading = page.getByRole('heading', { name: /sample-ai-app/i }).first();
    await expect(projectHeading).toBeVisible();
    const expandButton = page.getByRole('button', { name: /view details/i }).first();
    await expandButton.click();
    const markdownViewer = page.getByTestId('markdown-viewer');
    await expect(markdownViewer).toBeVisible();
    await expect(markdownViewer).toContainText(/surface inline documentation/i);
  });
});
