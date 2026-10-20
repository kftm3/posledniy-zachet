import { test, expect } from '@playwright/test';
import { selectCharacter, monitor } from './helpers';

test('a new player sees no achievements menu button or speculative achievement downloads', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('./');
  await expect(page.locator('#start-achievements-button')).toBeHidden();
  expect(requests.some(url => url.includes('/achievements/'))).toBe(false);
});

for (const phone of [false, true]) {
  test.describe(phone ? 'phone achievements' : 'desktop achievements', () => {
    test.use({
      viewport: phone ? { width: 874, height: 353 } : { width: 1280, height: 800 },
      isMobile: phone, hasTouch: phone,
    });
    test('unlocked cards glow, locked icons dim, descriptions and Back remain accessible', async ({ page }) => {
      const errors = monitor(page);
      const requests: string[] = [];
      page.on('request', request => requests.push(request.url()));
      await page.addInitScript(() => {
        localStorage.setItem('last-exam-achievements-v1', JSON.stringify(['history-keeper', 'hello']));
      });
      await selectCharacter(page);
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('game:exam-scene-finished', {
        detail: { correct: 6, isExcellentEnding: true, archetype: 'ОТЛИЧНИК' },
      })));
      for (let n = 0; n < 25 && !await page.locator('#ending-credits-video').count(); n++) {
        await page.locator('#excellent-ending-next').click();
      }
      await page.locator('#ending-credits-video').evaluate(video => video.dispatchEvent(new Event('ended')));
      await page.getByRole('button', { name: 'ДОСТИЖЕНИЯ', exact: true }).click();
      const panel = page.locator('.achievements-book');
      await expect(panel).toHaveCSS('opacity', '1');
      const unlocked = page.locator('[data-achievement="history-keeper"]');
      const locked = page.locator('[data-achievement="too-clever"]');
      await expect(unlocked).toHaveClass(/is-unlocked/);
      await expect(locked).toHaveClass(/is-locked/);
      await expect(unlocked).not.toHaveCSS('box-shadow', 'none');
      await expect(locked.locator('.achievement-item-icon')).toHaveCSS('filter', /grayscale\(1\).*brightness\(0.5\)/);
      await expect(unlocked.locator('.achievement-item-icon')).toHaveCSS('filter', /drop-shadow/);
      await expect(page.locator('[data-achievement="hesoyam"] .achievement-item-title')).toHaveText('???');
      await expect(page.locator('.achievement-item')).toHaveCount(12);
      await page.locator('.achievement-item').last().evaluate(el => el.scrollIntoView({ block: 'nearest' }));
      const dimensions = await panel.evaluate(el => {
        const rect = el.getBoundingClientRect();
        const footer = el.querySelector('.achievement-footer')!.getBoundingClientRect();
        const list = el.querySelector('.achievements-list')!.getBoundingClientRect();
        const last = el.querySelector('.achievement-item:last-child')!.getBoundingClientRect();
        return { fits: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
          footerFits: footer.bottom <= rect.bottom, listAboveFooter: list.bottom <= footer.top,
          lastVisible: last.top >= list.top && last.bottom <= list.bottom + 1 };
      });
      expect(dimensions).toEqual({ fits: true, footerFits: true, listAboveFooter: true, lastVisible: true });
      expect(requests.some(url => url.endsWith('/achievement-panel.webp'))).toBe(false);
      await page.getByRole('button', { name: 'НАЗАД', exact: true }).click();
      await expect(page.locator('#achievements-page-overlay')).toHaveCount(0);
      await expect(page.locator('#final-result-screen')).toBeVisible();
      await page.getByRole('button', { name: 'В ГЛАВНОЕ МЕНЮ', exact: true }).click();
      const menuButton = page.getByRole('button', { name: 'МОИ ДОСТИЖЕНИЯ', exact: true });
      await expect(menuButton).toBeVisible();
      await expect(menuButton).toHaveCSS('opacity', '1');
      await expect(page.locator('#start-button')).toHaveCSS('opacity', '1');
      const menuBox = (await menuButton.boundingBox())!;
      const startBox = (await page.locator('#start-button').boundingBox())!;
      expect(menuBox.y).toBeGreaterThanOrEqual(startBox.y + startBox.height);
      expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(page.viewportSize()!.height);
      await menuButton.click();
      await expect(page.locator('[data-achievement="history-keeper"]')).toHaveClass(/is-unlocked/);
      await page.getByRole('button', { name: 'НАЗАД', exact: true }).click();
      await expect(page.locator('#start-screen')).toBeVisible();
      await expect(page.locator('#achievements-page-overlay')).toHaveCount(0);
      await expect(page.locator('#final-result-screen')).toHaveCount(0);
      await page.reload();
      await expect(menuButton).toBeVisible();
      await menuButton.click();
      await expect(page.locator('[data-achievement="history-keeper"]')).toHaveClass(/is-unlocked/);
      await expect(page.locator('[data-achievement="too-clever"]')).toHaveClass(/is-locked/);
      await page.getByRole('button', { name: 'НАЗАД', exact: true }).click();
      await expect(page.locator('#start-screen')).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}
