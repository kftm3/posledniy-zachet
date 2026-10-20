import { test, expect } from '@playwright/test';
import { selectCharacter, openTicket, monitor, recordCueStarts } from './helpers';

test('title loads under 4 MiB and does not download hidden scenes/media', async ({ page }) => {
  const errors = monitor(page);
  const requests: string[] = [];
  page.on('request', req => requests.push(new URL(req.url()).pathname));
  await page.goto('./');
  await page.waitForTimeout(1500);
  await expect(page.locator('#start-button img')).toHaveJSProperty('complete', true);
  expect(requests.filter(url => /\.(mp3|mp4|wav|flac)$/.test(url))).toEqual([]);
  expect(requests.filter(url => /\/characters\/|\/endings\/|\/cameo\//.test(url))).toEqual([]);
  const bytes = await page.evaluate(() => performance.getEntriesByType('resource').reduce((sum, item) => sum + (item as PerformanceResourceTiming).encodedBodySize, 0));
  expect(bytes).toBeLessThan(4 * 1024 * 1024);
  expect(errors).toEqual([]);
});

test('all regular characters and emotions have usable images and responsive portraits', async ({ page }) => {
  const errors = monitor(page);
  await selectCharacter(page);
  for (const gender of ['male', 'female']) {
    for (let i = 0; i < 5; i++) {
      await page.locator(`.${gender}-panel .portrait-slot[data-index="${i}"]`).click();
      for (const emotion of ['normal', 'smile', 'thinking', 'confident', 'worried']) {
        await page.evaluate(emotion => window.dispatchEvent(new CustomEvent('game:dialogue-line', { detail: { emotion } })), emotion);
        const image = page.locator(`.${gender}-panel .character-full-sprite.is-visible`);
        await expect(image).toHaveCount(1);
        await expect(image).toHaveAttribute('src', new RegExp(`/${emotion}\\.webp$`));
        await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      }
    }
  }
  const portrait = page.locator('.male-panel .portrait-slot[data-index="0"] img');
  await expect.poll(() => portrait.evaluate((img: HTMLImageElement) => img.currentSrc)).toMatch(/card-(256|512)\.webp$/);
  expect(errors).toEqual([]);
});

test('storage denial does not prevent character setup and the ticket', async ({ page }) => {
  const errors = monitor(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Denied', 'SecurityError'); } });
  });
  await openTicket(page);
  expect(errors).toEqual([]);
  await expect(page.locator('#ticket-screen img[src="x"]')).toHaveCount(0);
});

test('corrupted saved female preset falls back to an existing character', async ({ page }) => {
  const errors = monitor(page);
  await page.addInitScript(() => {
    localStorage.setItem('last-exam-hesoyam-unlocked', 'true');
    localStorage.setItem('last-exam-character-selection', JSON.stringify({ gender: 'female', malePreset: 0, femalePreset: 5 }));
  });
  await selectCharacter(page);
  await expect(page.locator('#female-girl1-sprite')).toHaveClass(/is-visible/);
  await expect.poll(() => page.locator('#female-girl1-sprite').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(errors).toEqual([]);
});

for (const profile of ['excellent', 'trickster'] as const) {
test(`play through corridor, classroom, exam and ${profile} ending without broken assets`, async ({ page }) => {
  const errors = monitor(page);
  await recordCueStarts(page);
  await openTicket(page, profile);
  await page.locator('#ticket-start').click();
  await page.locator('#intro-video-skip').click();
  await expect(page.locator('#corridor-screen')).toBeVisible();
  let sawTricksterReaction = false;
  let sawTeacherThought = false;
  let sawExamThought = false;
  // Follow the visible narrative controls, including choices and random cameo.
  for (let step = 0; step < 180; step++) {
    if ((await page.locator('#exam-dialogue-text').textContent())?.includes('И никаких лишних подозрений')) sawTricksterReaction = true;
    if (await page.locator('#teacher-intro-screen').isVisible() && await page.locator('#teacher-speaker').textContent() === 'МЫСЛИ') {
      await expect(page.locator('#teacher-hero-sprite')).toHaveAttribute('src', /\/thinking\.webp$/);
      sawTeacherThought = true;
    }
    if (await page.locator('#exam-screen').isVisible() && await page.locator('#exam-speaker').textContent() === 'МЫСЛИ') {
      await expect(page.locator('#exam-hero-sprite')).toHaveAttribute('src', /\/thinking\.webp$/);
      sawExamThought = true;
    }
    if (await page.locator('#excellent-ending').isVisible()) break;
    const candidates = [
      '#cameo-next', '#corridor-choices button', '#corridor-exit', '#corridor-next',
      '#classroom-next', '#gallery-next', '#classroom-classmates-choices button',
      '#classmates-choices button', '#classmates-next', '#teacher-choices button',
      '#teacher-intro-choices button', '#teacher-next', '#exam-answer-list button[data-answer-index="1"]', '#exam-next',
    ];
    let clicked = false;
    for (const selector of candidates) {
      const button = page.locator(`${selector}:visible`).first();
      if (await button.count() && await button.isEnabled()) {
        // A scene can finish its asynchronous transition between visibility
        // detection and click. Retry the new scene instead of waiting on an old button.
        try { await button.click({ timeout: 2000 }); }
        catch (error) { if (await button.isVisible()) throw error; }
        clicked = true;
        break;
      }
    }
    await page.waitForTimeout(clicked ? 80 : 150);
  }
  if (profile === 'trickster') expect(sawTricksterReaction).toBe(true);
  expect(sawTeacherThought).toBe(true);
  expect(sawExamThought).toBe(true);
  await expect(page.locator('#excellent-ending')).toBeVisible();
  for (let step = 0; step < 25; step++) {
    if (await page.locator('#ending-credits-video').count()) break;
    await page.locator('#excellent-ending-next').click();
  }
  await expect(page.locator('#ending-credits-video')).toBeVisible();
  const cues = await page.evaluate(() => (window as any).__cueStarts);
  expect(cues.some((cue: any) => cue.speaker === 'АРТУР' && cue.duration > 0)).toBe(true);
  expect(cues.some((cue: any) => cue.speaker === 'КОТ' && cue.duration > 0)).toBe(true);
  expect(cues.some((cue: any) => cue.speaker === 'МАМА · ТЕЛЕФОН' && cue.duration > 3)).toBe(true);
  // Exercise the actual media completion handler without waiting for the whole film.
  await page.locator('#ending-credits-video').evaluate(video => video.dispatchEvent(new Event('ended')));
  await expect(page.locator('#final-result-screen')).toBeVisible();
  await page.getByRole('button', { name: 'В ГЛАВНОЕ МЕНЮ', exact: true }).click();
  await expect(page.locator('#start-screen')).toBeVisible();
  expect(errors).toEqual([]);
});
}

test.describe('mobile landscape', () => {
  test.use({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  test('character selection remains usable at high pixel density', async ({ page }) => {
    const errors = monitor(page);
    await selectCharacter(page);
    await page.locator('.female-panel .portrait-slot[data-index="2"]').click();
    const image = page.locator('#female-girl3-sprite');
    await expect(image).toHaveClass(/is-visible/);
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    const portrait = page.locator('.female-panel .portrait-slot[data-index="2"] img');
    await expect.poll(() => portrait.evaluate((img: HTMLImageElement) => img.currentSrc)).toMatch(/card-(256|512)\.webp$/);
    expect(errors).toEqual([]);
  });
});
