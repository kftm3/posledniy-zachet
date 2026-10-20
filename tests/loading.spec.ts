import { test, expect } from '@playwright/test';
import { selectCharacter, openTicket, monitor } from './helpers';

test('selected character stays visible until a delayed replacement is decoded', async ({ page }) => {
  const errors = monitor(page);
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/student_boy2/normal.webp', async route => {
    await delayed;
    await route.continue();
  });
  await selectCharacter(page);
  await expect(page.locator('#male-boy1-sprite')).toHaveClass(/is-visible/);
  await page.locator('.male-panel .portrait-slot[data-index="1"]').click();
  await expect(page.locator('#character-screen')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#male-boy1-sprite')).toHaveClass(/is-visible/);
  await expect(page.locator('#male-boy2-sprite')).not.toHaveClass(/is-visible/);
  release();
  await expect(page.locator('#male-boy2-sprite')).toHaveClass(/is-visible/);
  await expect.poll(() => page.locator('#male-boy2-sprite').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(errors).toEqual([]);
});

test('rapid character changes cannot reveal a stale late response', async ({ page }) => {
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/student_boy2/normal.webp', async route => { await delayed; await route.continue(); });
  await selectCharacter(page);
  await page.locator('.male-panel .portrait-slot[data-index="1"]').click();
  await page.locator('.female-panel .portrait-slot[data-index="2"]').click();
  await expect(page.locator('#female-girl3-sprite')).toHaveClass(/is-visible/);
  release();
  await page.waitForTimeout(400);
  await expect(page.locator('#male-boy2-sprite')).not.toHaveClass(/is-visible/);
  await expect(page.locator('#female-girl3-sprite')).toHaveClass(/is-visible/);
});

test('corridor audio is prepared early and the auditorium waits for its delayed background', async ({ page }) => {
  const errors = monitor(page);
  const requests: string[] = [];
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  await page.addInitScript(() => {
    const original = HTMLMediaElement.prototype.load;
    (window as any).__mediaLoads = [];
    HTMLMediaElement.prototype.load = function () {
      (window as any).__mediaLoads.push(new URL(this.src, location.href).pathname);
      return original.call(this);
    };
  });
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/classroom-last-exam-background.webp', async route => {
    await delayed;
    await route.continue();
  });
  await openTicket(page);
  await expect.poll(() => requests.some(path => path.endsWith('/archetype-excellent.mp3'))).toBe(true);
  await expect(page.locator('#corridor-screen')).toBeHidden();
  await page.locator('#ticket-start').click();
  await page.locator('#intro-video-skip').click();
  await expect(page.locator('#corridor-screen')).toBeVisible();
  await expect.poll(() => requests.some(path => path.endsWith('/classroom-last-exam-background.webp'))).toBe(true);
  // Future music must not take bandwidth away from a still-blocked entry background.
  expect(requests.some(path => path.endsWith('/C418-Aria_Math.mp3'))).toBe(false);
  for (let i = 0; i < 5; i++) await page.locator('#corridor-next').click();
  await page.locator('#corridor-choices button').first().click();
  await page.locator('#corridor-exit').click();
  await expect(page.locator('#asset-loading-status')).toBeVisible();
  await expect(page.locator('#classroom-intro-screen')).toBeHidden();
  release();
  await expect(page.locator('#classroom-intro-screen')).toBeVisible();
  await expect(page.locator('#asset-loading-status')).toBeHidden();
  const loads: string[] = await page.evaluate(() => (window as any).__mediaLoads);
  expect(loads.filter(path => path.endsWith('/archetype-excellent.mp3'))).toHaveLength(1);
  expect(loads.filter(path => path.endsWith('/C418-Aria_Math.mp3'))).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('failed character request can be retried without hiding the current character', async ({ page }) => {
  let attempts = 0;
  await page.route('**/student_boy2/normal.webp', async route => {
    attempts++;
    if (attempts === 1) await route.abort();
    else await route.continue();
  });
  await selectCharacter(page);
  // dispatchEvent avoids hover prefetch so the first failure belongs to this selection.
  const portrait = page.locator('.male-panel .portrait-slot[data-index="1"]');
  await portrait.dispatchEvent('click');
  await expect(page.locator('#selection-toast')).toHaveText(/Не удалось загрузить/);
  await expect(page.locator('#male-boy1-sprite')).toHaveClass(/is-visible/);
  await portrait.dispatchEvent('click');
  await expect(page.locator('#male-boy2-sprite')).toHaveClass(/is-visible/);
});

test('classroom music is prepared during corridor dialogue once its background is ready', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  await openTicket(page);
  await page.locator('#ticket-start').click();
  await page.locator('#intro-video-skip').click();
  await expect(page.locator('#corridor-screen')).toBeVisible();
  await expect.poll(() => requests.some(path => path.endsWith('/C418-Aria_Math.mp3'))).toBe(true);
  await expect(page.locator('#classroom-intro-screen')).toBeHidden();
  expect(requests.findIndex(path => path.endsWith('/classroom-last-exam-background.webp')))
    .toBeLessThan(requests.findIndex(path => path.endsWith('/C418-Aria_Math.mp3')));
});
