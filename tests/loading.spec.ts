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

test('corridor follows each dialogue emotion and cancels a stale replacement', async ({ page }) => {
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/student_boy1/smile.webp', async route => { await delayed; await route.continue(); });
  await openTicket(page);
  await page.locator('#ticket-start').click();
  await page.locator('#intro-video-skip').click();
  const hero = page.locator('#corridor-character-sprite');
  await expect(hero).toHaveAttribute('src', /\/thinking\.webp$/);
  await page.locator('#corridor-next').click(); // Smile is still downloading.
  await expect(hero).toHaveAttribute('data-emotion', 'smile');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('game:dialogue-line', { detail: { emotion: 'thinking' } })));
  release();
  await page.waitForTimeout(500);
  await expect(hero).toHaveAttribute('src', /\/thinking\.webp$/);
  for (const emotion of ['confident', 'worried', 'thinking']) {
    await page.locator('#corridor-next').click();
    await expect(hero).toHaveAttribute('src', new RegExp(`/${emotion}\\.webp$`));
    await expect.poll(() => hero.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  }
});

test('a delayed intro play promise cannot pause the real video after the disclaimer', async ({ page }) => {
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    let firstIntro = true;
    (window as any).__releaseIntroPlay = undefined;
    HTMLMediaElement.prototype.play = function () {
      if (this.id === 'intro-video' && firstIntro) {
        firstIntro = false;
        return new Promise<void>(resolve => { (window as any).__releaseIntroPlay = resolve; });
      }
      return play.call(this);
    };
  });
  await openTicket(page);
  await expect.poll(() => page.locator('#intro-video').evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(2);
  await page.locator('#ticket-start').click();
  await expect(page.locator('#intro-video-overlay')).toBeVisible();
  await expect.poll(() => page.locator('#intro-video').evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  await page.evaluate(() => (window as any).__releaseIntroPlay());
  await page.waitForTimeout(300);
  await expect.poll(() => page.locator('#intro-video').evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  await page.locator('#intro-video-skip').click();
  await expect(page.locator('#intro-video')).toHaveAttribute('preload', 'none');
});

test('results and achievements are prepared before opening and wait for slow artwork', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', req => requests.push(new URL(req.url()).pathname));
  await page.addInitScript(() => {
    const load = HTMLMediaElement.prototype.load;
    (window as any).__creditsLoads = [];
    HTMLMediaElement.prototype.load = function () {
      if (this.id === 'ending-credits-video') (window as any).__creditsLoads.push({ attached: this.isConnected, source: this.src });
      return load.call(this);
    };
  });
  let releaseBook!: () => void;
  let releaseAchievements!: () => void;
  const book = new Promise<void>(resolve => { releaseBook = resolve; });
  const achievements = new Promise<void>(resolve => { releaseAchievements = resolve; });
  await selectCharacter(page);
  await page.route('**/final-screen/passbook.webp', async route => { await book; await route.continue(); });
  await page.route('**/achievements/achievement-panel.webp', async route => { await achievements; await route.continue(); });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('game:exam-scene-finished', { detail: { correct: 6, isExcellentEnding: true } })));
  await expect.poll(() => requests.some(path => path.endsWith('/final-screen/passbook.webp'))).toBe(true);
  await expect(page.locator('#final-result-screen')).toHaveCount(0);
  // Release the result book before the 15s network timeout; the slow achievements
  // remain independent of the result screen and credits playback.
  releaseBook();
  for (let i = 0; i < 25; i++) {
    if (await page.locator('#ending-credits-video').count()) break;
    await page.locator('#excellent-ending-next').click();
  }
  await expect(page.locator('#ending-credits-video')).toBeVisible();
  await expect.poll(() => requests.some(path => path.endsWith('/achievements/achievement-panel.webp'))).toBe(true);
  const loads = await page.evaluate(() => (window as any).__creditsLoads);
  expect(loads).toHaveLength(1);
  expect(loads[0].attached).toBe(false);
  await page.locator('#ending-credits-video').evaluate(v => v.dispatchEvent(new Event('ended')));
  await expect(page.locator('#final-result-screen')).toBeVisible();
  await expect.poll(() => page.locator('#final-result-screen img').evaluateAll(images => images.every(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.getByRole('button', { name: 'ДОСТИЖЕНИЯ', exact: true }).click();
  await expect(page.locator('#asset-loading-status')).toBeVisible();
  await expect(page.locator('#achievements-page-overlay')).toHaveCount(0);
  releaseAchievements();
  await expect(page.locator('#achievements-page-overlay')).toBeVisible();
  await expect.poll(() => page.locator('#achievements-page-overlay img').evaluateAll(images => images.every(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.getByRole('button', { name: 'НАЗАД', exact: true }).click();
  await expect(page.locator('#final-result-screen')).toBeVisible();
});
