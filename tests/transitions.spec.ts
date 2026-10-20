import { test, expect } from '@playwright/test';
import { openTicket, selectCharacter, monitor } from './helpers';

test('friend expressions stay synchronized with dialogue even on a slow connection', async ({ page }) => {
  const errors = monitor(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/characters/*/smile.webp', async route => { await gate; await route.continue(); });
  await openTicket(page);
  await page.locator('#ticket-start').click();
  await page.locator('#intro-video-skip').click();
  const friend = page.locator('#corridor-friend-sprite');
  await expect(friend).toBeVisible();
  await expect(friend).toHaveAttribute('src', /\/thinking\.webp$/);
  const folder = (await friend.getAttribute('src'))!.replace(/\/thinking\.webp$/, '');
  await page.locator('#corridor-next').click();
  await expect(page.locator('#corridor-next')).toBeDisabled();
  await expect(page.locator('#corridor-progress')).toHaveText('1 / 5');
  await expect(friend).toHaveAttribute('src', `${folder}/thinking.webp`);
  release();
  await expect(friend).toHaveAttribute('src', `${folder}/smile.webp`);
  for (const emotion of ['confident', 'worried', 'thinking']) {
    await page.locator('#corridor-next').click();
    await expect(friend).toHaveAttribute('src', `${folder}/${emotion}.webp`);
    await expect(friend).toHaveAttribute('data-emotion', emotion);
    await expect.poll(() => friend.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  }
  await page.locator('#corridor-next').click();
  await expect(friend).toBeHidden();
  expect(errors).toEqual([]);
});

test.describe('animated scene changes', () => {
  test.use({ reducedMotion: 'no-preference' });
  test('scenes switch under an opaque cover and Continue uses a text button', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__sceneCovers = [];
      addEventListener('DOMContentLoaded', () => {
        for (const id of ['character-screen', 'input-screen']) {
          const scene = document.getElementById(id)!;
          new MutationObserver(records => {
            if (records.some(record => record.oldValue?.includes('is-hidden')) && !scene.classList.contains('is-hidden')) {
              (window as any).__sceneCovers.push({ id, opacity: Number(getComputedStyle(document.getElementById('screen-transition')!).opacity) });
            }
          }).observe(scene, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
        }
      });
    });
    const requests: string[] = [];
    page.on('request', req => requests.push(req.url()));
    await selectCharacter(page);
    const button = page.locator('#continue-button');
    await expect(button).toHaveText(/ПРОДОЛЖИТЬ/);
    await expect(button.locator('img')).toHaveCount(0);
    await button.click();
    await expect(page.locator('#input-screen')).toBeVisible();
    await expect(page.locator('#screen-transition')).toHaveAttribute('aria-hidden', 'true');
    const covers = await page.evaluate(() => (window as any).__sceneCovers);
    expect(covers.map((item: any) => item.id)).toEqual(['character-screen', 'input-screen']);
    expect(covers.every((item: any) => item.opacity >= 0.99)).toBe(true);
    expect(requests.some(url => url.includes('button_continue'))).toBe(false);
  });
});
