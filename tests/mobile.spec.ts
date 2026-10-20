import { test, expect, type Locator, type Page } from '@playwright/test';
import { selectCharacter, monitor } from './helpers';

test.use({
  viewport: { width: 874, height: 353 },
  screen: { width: 874, height: 402 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});

async function contained(locator: Locator, parent?: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${locator} has a box`).not.toBeNull();
  const bounds = parent ? await parent.boundingBox() : { x: 0, y: 0, ...locator.page().viewportSize()! };
  expect(bounds).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(bounds!.x - 1);
  expect(box!.y).toBeGreaterThanOrEqual(bounds!.y - 1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height + 1);
}

async function settle(page: Page) {
  await expect(page.locator('#screen-transition')).toHaveAttribute('aria-hidden', 'true');
}

async function setupSkills(page: Page) {
  await selectCharacter(page);
  await page.locator('#continue-button').tap();
  await settle(page);
  await page.locator('#player-surname').fill('Иванов');
  await page.locator('#player-name').fill('Иван');
  await page.locator('#player-group').fill('123');
  await page.locator('#player-form button').tap();
  await expect(page.locator('#skills-screen')).toBeVisible();
  await settle(page);
}

async function ticket(page: Page) {
  await setupSkills(page);
  for (const [skill, count] of [['knowledge', 4], ['logic', 4], ['attention', 2]] as const) {
    for (let n = 0; n < count; n++) await page.locator(`[data-skill="${skill}"] [data-delta="1"]`).tap();
  }
  await page.locator('#skills-continue').tap();
  await expect(page.locator('#ticket-screen')).toBeVisible();
  await settle(page);
}

for (const viewport of [{ width: 874, height: 353 }, { width: 812, height: 320 }, { width: 874, height: 402 }]) {
  test(`portraits, skill taps and student ticket fit ${viewport.width}×${viewport.height}`, async ({ page }) => {
    const errors = monitor(page);
    await page.setViewportSize(viewport);
    await selectCharacter(page);
    if (viewport.height === 402) await page.addStyleTag({ content: ':root{--phone-left:59px;--phone-right:59px;--phone-bottom:21px;}' });
    for (const gender of ['male', 'female']) {
      for (let n = 0; n < 5; n++) {
        const card = page.locator(`.${gender}-panel .portrait-slot[data-index="${n}"]`);
        await contained(card);
        const box = (await card.boundingBox())!;
        const next = (await page.locator('#continue-button').boundingBox())!;
        expect(box.y + box.height).toBeLessThan(next.y);
        await card.tap();
        await expect(card).toHaveClass(/is-selected/);
      }
    }
    await page.locator('#continue-button').tap();
    await settle(page);
    await page.locator('#player-surname').fill('Иванова');
    await page.locator('#player-name').fill('Анна');
    await page.locator('#player-group').fill('123');
    await page.locator('#player-form button').tap();
    await settle(page);
    for (const [skill, count] of [['knowledge', 4], ['logic', 4], ['attention', 2]] as const) {
      const card = page.locator(`[data-skill="${skill}"]`);
      const plus = card.locator('[data-delta="1"]');
      const minus = card.locator('[data-delta="-1"]');
      await contained(card, page.locator('.skills-board'));
      const cardBox = (await card.boundingBox())!;
      const footer = (await page.locator('#skills-back').boundingBox())!;
      expect(cardBox.y + cardBox.height).toBeLessThan(footer.y);
      await contained(plus, card);
      await contained(minus, card);
      for (let n = 1; n <= count; n++) {
        await plus.tap();
        await expect(card.locator('strong')).toHaveText(String(n));
      }
      await minus.tap();
      await expect(card.locator('strong')).toHaveText(String(count - 1));
      await plus.tap();
      await expect(card.locator('strong')).toHaveText(String(count));
    }
    await expect(page.locator('#points-left')).toHaveText('0');
    expect(await page.evaluate(() => visualViewport!.scale)).toBe(1);
    await page.locator('#skills-continue').tap();
    await settle(page);
    await contained(page.locator('.ticket-wrap'));
    await contained(page.locator('#ticket-archetype-description'), page.locator('.ticket-wrap'));
    await expect(page.locator('#ticket-archetype-description')).not.toBeEmpty();
    await contained(page.locator('#ticket-start'));
    await contained(page.locator('#ticket-back'));
    expect(errors).toEqual([]);
  });
}

test('classroom music starts in the entry tap; story frames and exam answers fit the phone', async ({ page }) => {
  const errors = monitor(page);
  await page.addInitScript(() => {
    // Model iOS's stricter first-play rule: an asynchronous first play is rejected.
    const state = { gesture: false, plays: [] as boolean[] };
    (window as any).__classroomPlay = state;
    document.addEventListener('click', () => {
      state.gesture = true;
      setTimeout(() => { state.gesture = false; }, 0);
    }, true);
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this.src.includes('C418-Aria_Math')) {
        state.plays.push(state.gesture);
        if (!state.gesture) return Promise.reject(new DOMException('User gesture required', 'NotAllowedError'));
      }
      return play.call(this);
    };
    Math.random = () => 0;
  });
  await ticket(page);
  await page.locator('#ticket-start').tap();
  await page.locator('#intro-video-skip').tap();
  await expect(page.locator('#corridor-screen')).toBeVisible();
  const corridorFrame = page.locator('#corridor-screen .corridor-dialogue-layout');
  const commonHeight = (await corridorFrame.boundingBox())!.height;
  for (let n = 0; n < 5; n++) await page.locator('#corridor-next').tap();
  for (const button of await page.locator('#corridor-choices button').all()) await contained(button, corridorFrame);
  await page.locator('#corridor-choices button').first().tap();
  await page.locator('#corridor-exit').tap();
  await expect(page.locator('#classroom-intro-screen')).toBeVisible();
  await settle(page);
  expect(await page.evaluate(() => (window as any).__classroomPlay.plays)).toEqual([true]);
  await expect(page.locator('.np-title')).toHaveText('Aria Math', { ignoreCase: true });
  await expect(page.locator('.now-playing-card')).toHaveClass(/is-visible/);
  expect((await page.locator('.now-playing-card').boundingBox())!.width).toBeLessThan(270);
  // Follow actual narrative controls through the gallery and teacher scene.
  for (let step = 0; step < 30 && !await page.locator('#teacher-intro-screen').isVisible(); step++) {
    for (const selector of ['#classroom-next', '#gallery-next', '#classmates-choices button', '#classmates-next']) {
      const next = page.locator(`${selector}:visible`).first();
      if (await next.count() && await next.isEnabled()) { await next.tap(); break; }
    }
    await page.waitForTimeout(80);
    if (await page.locator('#classroom-gallery-screen').isVisible()) {
      expect(await page.locator('.classroom-gallery-background').evaluate(el => getComputedStyle(el).backgroundSize)).toBe('contain');
    }
  }
  await expect(page.locator('#teacher-intro-screen')).toBeVisible();
  await settle(page);
  const teacherFrame = page.locator('#teacher-intro-screen .corridor-dialogue-layout');
  expect((await teacherFrame.boundingBox())!.height).toBeCloseTo(commonHeight, 0);
  expect((await page.locator('#teacher-scene-sprite').boundingBox())!.height).toBeGreaterThan(300);
  for (const button of await page.locator('#teacher-choices button').all()) await contained(button, teacherFrame);
  await page.locator('#teacher-choices button').first().tap();
  for (let n = 0; n < 10 && !await page.locator('#exam-screen').isVisible(); n++) {
    await page.locator('#teacher-next').tap();
    await page.waitForTimeout(80);
  }
  await expect(page.locator('#exam-screen')).toBeVisible();
  await settle(page);
  const examFrame = page.locator('#exam-dialogue-panel');
  expect((await examFrame.boundingBox())!.height).toBeCloseTo(commonHeight, 0);
  expect((await page.locator('#exam-teacher-sprite').boundingBox())!.height).toBeGreaterThan(300);
  await page.locator('#exam-next').tap();
  await page.locator('#exam-next').tap();
  await expect(page.locator('#exam-answer-list')).toBeVisible();
  await contained(examFrame);
  for (const button of await page.locator('#exam-answer-list button, .exam-paper-actions button').all()) await contained(button, examFrame);
  await page.touchscreen.tap(400, 60);
  await page.touchscreen.tap(400, 60);
  expect(await page.evaluate(() => visualViewport!.scale)).toBe(1);
  expect(await page.locator('#exam-screen').evaluate(el => getComputedStyle(el).touchAction)).toBe('manipulation');
  await page.locator('#exam-answer-list button').first().tap();
  await contained(page.locator('#exam-next'), examFrame);
  expect(errors).toEqual([]);
});

test('cameo, ending, result book and scrollable achievements remain within the viewport', async ({ page }) => {
  const errors = monitor(page);
  await page.addInitScript(() => { Math.random = () => 0; });
  await selectCharacter(page);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('game:exam-intro-requested')));
  await expect(page.locator('#exam-screen')).toBeVisible();
  await settle(page);
  for (let q = 0; q < 2; q++) {
    await page.locator('#exam-next').tap();
    await page.locator('#exam-next').tap();
    await page.locator('#exam-answer-list button[data-answer-index="1"]').tap();
    await page.locator('#exam-next').tap();
    await page.locator('#exam-next').tap();
  }
  await expect(page.locator('#cameo-overlay')).toBeVisible();
  await contained(page.locator('#cameo-dialogue-panel'));
  await contained(page.locator('#cameo-next'), page.locator('#cameo-dialogue-panel'));
  expect(await page.locator('#cameo-scene-image').evaluate(el => getComputedStyle(el).objectFit)).toBe('contain');
  expect((await page.locator('.cameo-scene-frame').boundingBox())!.y).toBe(12);
  for (let n = 0; n < 3; n++) await page.locator('#cameo-next').tap();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('game:exam-scene-finished', {
    detail: { correct: 6, isExcellentEnding: true, archetype: 'ОТЛИЧНИК' },
  })));
  await expect(page.locator('#excellent-ending')).not.toHaveClass(/is-blackout/);
  await contained(page.locator('#excellent-ending-next'));
  expect(await page.locator('#excellent-ending-image').evaluate(el => getComputedStyle(el).objectFit)).toBe('contain');
  for (let n = 0; n < 25 && !await page.locator('#ending-credits-video').count(); n++) await page.locator('#excellent-ending-next').tap();
  await page.locator('#ending-credits-video').evaluate(video => video.dispatchEvent(new Event('ended')));
  await expect(page.locator('#final-result-screen')).toBeVisible();
  const book = page.locator('.final-result-book');
  await contained(book);
  const box = (await book.boundingBox())!;
  expect(box.width / box.height).toBeCloseTo(1671 / 941, 2);
  const photo = (await page.locator('.final-result-portrait').boundingBox())!;
  const surname = (await page.locator('[data-field="surname"]').boundingBox())!;
  expect(photo.x + photo.width).toBeLessThan(surname.x);
  for (const field of await page.locator('.final-result-field').all()) await contained(field, book);
  for (const button of await page.locator('#final-result-actions button').all()) await contained(button);
  await page.getByRole('button', { name: 'ДОСТИЖЕНИЯ', exact: true }).tap();
  await expect(page.locator('.achievements-book')).toHaveCSS('opacity', '1');
  await contained(page.locator('.achievements-book'));
  const back = page.locator('.achievement-back');
  await contained(back);
  await expect(page.locator('.achievement-item')).toHaveCount(12);
  const list = page.locator('.achievements-list');
  for (const item of await page.locator('.achievement-item').all()) {
    await item.evaluate(el => el.scrollIntoView({ block: 'nearest' }));
    await contained(item, list);
    await contained(item.locator('.achievement-item-icon'), item);
    await contained(item.locator('.achievement-item-description'), item);
  }
  await contained(back);
  await back.tap();
  await expect(page.locator('#achievements-page-overlay')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('portrait orientation blocks the game and clears after rotation', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto('./');
  await expect(page.locator('#orientation-overlay')).toBeVisible();
  await expect(page.locator('#orientation-overlay')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('main')).toHaveAttribute('inert', '');
  await page.setViewportSize({ width: 874, height: 353 });
  await expect(page.locator('#orientation-overlay')).toBeHidden();
  await expect(page.locator('main')).not.toHaveAttribute('inert', '');
  await page.locator('#start-button').tap();
  await expect(page.locator('#character-screen')).toBeVisible();
});
