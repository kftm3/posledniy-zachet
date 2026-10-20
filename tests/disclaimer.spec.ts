import { test, expect } from '@playwright/test';
import { openTicket, monitor } from './helpers';

test('disclaimer artwork is ready before starting and remains visible for reading', async ({ page }) => {
  const errors = monitor(page);
  await openTicket(page);
  const image = page.locator('#disclaimer-overlay .disclaimer-image');
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.locator('#ticket-start').click();
  await expect(page.locator('#disclaimer-overlay')).toHaveClass(/has-artwork/);
  await expect(image).toBeVisible();
  await page.waitForTimeout(2000);
  await expect(page.locator('#disclaimer-overlay')).toBeVisible();
  await expect(page.locator('#intro-video-overlay')).toBeHidden();
  await expect(page.locator('#intro-video-overlay')).toBeVisible();
  await page.locator('#intro-video-skip').click();
  await expect(page.locator('#corridor-screen')).toBeVisible();
  expect(errors).toEqual([]);
});

test('slow disclaimer artwork cannot leave a blank screen or shorten the reading period', async ({ page }) => {
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/assets/disclaimer.jpg', async route => { await delayed; await route.continue(); });
  await openTicket(page);
  await page.locator('#ticket-start').click();
  await expect(page.locator('#disclaimer-overlay .disclaimer-copy')).toBeVisible();
  await expect(page.locator('#disclaimer-overlay .disclaimer-copy')).toContainText('Все персонажи и сюжетные события');
  await expect(page.locator('#disclaimer-overlay')).not.toHaveClass(/has-artwork/);
  // An ended event from hidden playback priming must not skip the disclaimer.
  await page.locator('#intro-video').evaluate(video => video.dispatchEvent(new Event('ended')));
  await page.waitForTimeout(2000);
  await expect(page.locator('#disclaimer-overlay')).toBeVisible();
  await expect(page.locator('#corridor-screen')).toBeHidden();
  await expect(page.locator('#intro-video-overlay')).toBeVisible();
  release();
  await expect(page.locator('#disclaimer-overlay')).toBeHidden();
  await page.locator('#intro-video-skip').click();
  await expect(page.locator('#corridor-screen')).toBeVisible();
});

test('failed disclaimer image uses readable text and still advances to the video', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/assets/disclaimer.jpg', route => route.abort());
  await openTicket(page);
  await page.locator('#ticket-start').click();
  await expect(page.locator('#disclaimer-overlay .disclaimer-copy')).toBeVisible();
  await expect(page.locator('#disclaimer-overlay .disclaimer-copy')).toContainText('Приятной игры!');
  await expect(page.locator('#intro-video-overlay')).toBeVisible();
  expect(errors).toEqual([]);
});
