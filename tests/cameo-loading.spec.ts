import { test, expect } from '@playwright/test';
import { selectCharacter, monitor, recordCueStarts } from './helpers';

test('character loader rotates jokes, hides on completion and ignores stale selections', async ({ page }) => {
  let releaseFirst!: () => void;
  let releaseSecond!: () => void;
  const first = new Promise<void>(resolve => { releaseFirst = resolve; });
  const second = new Promise<void>(resolve => { releaseSecond = resolve; });
  await page.route('**/student_boy1/normal.webp', async route => { await first; await route.continue(); });
  await page.route('**/student_boy2/normal.webp', async route => { await second; await route.continue(); });
  await page.goto('./');
  await page.locator('#start-button').click();
  const loader = page.locator('#character-loading');
  await expect(loader).toBeVisible();
  const message = await page.locator('#character-loading-message').textContent();
  expect(message?.length).toBeGreaterThan(20);
  await expect(page.locator('#character-loading-message')).not.toHaveText(message!, { timeout: 6000 });
  releaseFirst();
  await expect(page.locator('#character-screen')).toBeVisible();
  await expect(page.locator('#start-button')).toBeEnabled();
  await expect(loader).toBeHidden();
  await page.locator('.male-panel .portrait-slot[data-index="1"]').click();
  await expect(loader).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(() => page.evaluate(() => {
    const loading = document.getElementById('character-loading')!.getBoundingClientRect();
    const portrait = document.querySelector('.male-panel .portrait-slot[data-index="1"]')!.getBoundingClientRect();
    const next = document.getElementById('continue-button')!.getBoundingClientRect();
    return { belowPortraits: loading.top >= portrait.bottom, besideContinue: loading.right <= next.left };
  })).toEqual({ belowPortraits: true, besideContinue: true });
  await page.locator('.female-panel .portrait-slot[data-index="2"]').click();
  await expect(page.locator('#female-girl3-sprite')).toHaveClass(/is-visible/);
  await expect(loader).toBeHidden();
  releaseSecond();
  await page.waitForTimeout(200);
  await expect(loader).toBeHidden();
  await expect(page.locator('#female-girl3-sprite')).toHaveClass(/is-visible/);
});

for (const branch of ['friendly', 'angry'] as const) {
  test(`cameo ${branch} prepares artwork and keeps the current frame until the next is ready`, async ({ page }) => {
    const errors = monitor(page);
    await page.addInitScript(value => { Math.random = () => value; }, branch === 'friendly' ? 0 : 0.999);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const file = branch === 'friendly' ? 'kftm3-friendly-reply.webp' : 'kftm3-angry-teacher.webp';
    let requested = false;
    await page.route(`**/${file}`, async route => { requested = true; await gate; await route.continue(); });
    await selectCharacter(page);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('game:exam-intro-requested')));
    await expect(page.locator('#exam-screen')).toBeVisible();
    await expect(page.locator('#screen-transition')).toHaveAttribute('aria-hidden', 'true');
    const count = branch === 'friendly' ? 2 : 6;
    const answers = branch === 'friendly' ? [1, 1] : [0, 2, 0, 1, 2, 0];
    for (let q = 0; q < count; q++) {
      await page.locator('#exam-next').click(); // Thought.
      await page.locator('#exam-next').click(); // Paper.
      if (q === count - 1) await expect.poll(() => requested).toBe(true);
      await page.locator(`#exam-answer-list button[data-answer-index="${answers[q]}"]`).click();
      await page.locator('#exam-next').click(); // Hero's feedback.
      await page.locator('#exam-next').click(); // Next question or cameo.
    }
    await expect(page.locator('#cameo-overlay')).toBeVisible();
    const image = page.locator('#cameo-scene-image');
    await expect(image).toHaveAttribute('src', /kftm3-entry\.webp$/);
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    const caption = await page.locator('#cameo-dialogue-text').textContent();
    await page.locator('#cameo-next').click();
    await expect(page.locator('#cameo-next')).toBeDisabled();
    await expect(image).toHaveAttribute('src', /kftm3-entry\.webp$/);
    await expect(page.locator('#cameo-dialogue-text')).toHaveText(caption!);
    release();
    await expect(image).toHaveAttribute('src', new RegExp(file.replaceAll('.', '[.]') + '$'));
    await expect(page.locator('#cameo-next')).toBeEnabled();
    await page.locator('#cameo-next').click();
    await expect(image).toHaveAttribute('src', branch === 'friendly' ? /kftm3-goodbye\.webp$/ : /kftm3-angry-exit\.webp$/);
    await page.locator('#cameo-next').click();
    await expect(page.locator('#cameo-overlay')).toBeHidden();
    expect(errors).toEqual([]);
  });
}

test('phone cue waits for the first ending frame and skips the source leading silence', async ({ page }) => {
  await recordCueStarts(page);
  await selectCharacter(page);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('game:exam-scene-finished', {
    detail: { correct: 6, isBraveEnding: true, archetype: 'СМЕЛЬЧАК' },
  })));
  await expect(page.locator('#excellent-ending')).toHaveClass(/is-blackout/);
  expect(await page.evaluate(() => (window as any).__cueStarts)).toEqual([]);
  await expect(page.locator('#excellent-ending')).not.toHaveClass(/is-blackout/);
  await expect.poll(() => page.evaluate(() => (window as any).__cueStarts.length)).toBe(1);
  const cue = await page.evaluate(() => (window as any).__cueStarts[0]);
  expect(cue.speaker).toBe('ДРУГ · ТЕЛЕФОН');
  expect(cue.offset).toBeCloseTo(0.30);
  expect(cue.duration).toBeGreaterThan(3);
});
