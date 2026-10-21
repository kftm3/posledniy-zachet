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
  const parentElement = parent ? await parent.elementHandle() : null;
  await expect.poll(() => locator.evaluate((el, parentEl) => {
    const box = el.getBoundingClientRect();
    const bounds = parentEl ? parentEl.getBoundingClientRect() : { x: 0, y: 0, width: innerWidth, height: innerHeight };
    return box.x >= bounds.x - 1 && box.y >= bounds.y - 1
      && box.right <= bounds.x + bounds.width + 1 && box.bottom <= bounds.y + bounds.height + 1;
  }, parentElement)).toBe(true);
}

// Subject points use coordinates in the source artwork, independent of CSS framing.
async function subjectAboveDialogue(image: Locator, points: number[][]) {
  await expect.poll(() => image.evaluate((node, points) => {
    const img = node as HTMLImageElement, box = img.getBoundingClientRect();
    const style = getComputedStyle(img), position = style.objectPosition.split(' ').map(parseFloat);
    const scale = Math.max(box.width / img.naturalWidth, box.height / img.naturalHeight);
    const left = box.x + (box.width - img.naturalWidth * scale) * position[0] / 100;
    const top = box.y + (box.height - img.naturalHeight * scale) * position[1] / 100;
    const dialogue = img.closest('#cameo-overlay,#excellent-ending')!.querySelector('.corridor-dialogue-layout')!.getBoundingClientRect();
    return points.every(([x,y]) => left + x * scale >= 0 && left + x * scale <= innerWidth && top + y * scale >= 0 && top + y * scale < dialogue.top);
  }, points)).toBe(true);
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
    const sprite = (await page.locator('#male-boy1-sprite').boundingBox())!;
    const fourth = (await page.locator('.male-panel .portrait-slot[data-index="3"]').boundingBox())!;
    const fifth = (await page.locator('.male-panel .portrait-slot[data-index="4"]').boundingBox())!;
    expect(sprite.height).toBeGreaterThan(viewport.height);
    expect(sprite.x + sprite.width / 2).toBeGreaterThan(fourth.x + fourth.width / 2);
    expect(sprite.x + sprite.width / 2).toBeLessThan(fifth.x + fifth.width / 2);
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
    const skillsScroll = page.locator('.skills-layout');
    expect(await skillsScroll.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    for (const skillCard of await page.locator('.skill-card').all()) {
      await skillCard.scrollIntoViewIfNeeded();
      await contained(skillCard, skillsScroll);
      for (const copy of await skillCard.locator('.skill-copy h2,.skill-copy p').all()) {
        await contained(copy, skillCard);
        expect(await copy.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      }
    }
    for (const [skill, count] of [['knowledge', 4], ['logic', 4], ['attention', 2]] as const) {
      const card = page.locator(`[data-skill="${skill}"]`);
      const plus = card.locator('[data-delta="1"]');
      const minus = card.locator('[data-delta="-1"]');
      await card.scrollIntoViewIfNeeded();
      await contained(card, page.locator('.skills-layout'));
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
    expect(await page.locator('.ticket-heading').evaluate(el => getComputedStyle(el,'::after').content)).not.toMatch(/[↕⬆⬇]/u);
    expect(await page.locator('.ticket-heading').evaluate(el => getComputedStyle(el,'::after').backgroundImage)).toContain('data:image/svg+xml');
    await contained(page.locator('.ticket-viewport'));
    expect((await page.locator('.ticket-wrap').boundingBox())!.width).toBeGreaterThan(viewport.width * .77);
    expect(await page.locator('.ticket-wrap').evaluate(el => getComputedStyle(el).transform)).toBe('none');
    await page.locator('#ticket-archetype-description').scrollIntoViewIfNeeded();
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
    const state = { gesture: false, plays: [] as boolean[], element: null as HTMLMediaElement | null };
    (window as any).__classroomPlay = state;
    document.addEventListener('click', () => {
      state.gesture = true;
      setTimeout(() => { state.gesture = false; }, 0);
    }, true);
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this.src.includes('C418-Aria_Math')) {
        state.element = this;
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
  const corridorBox = (await corridorFrame.boundingBox())!;
  expect(corridorBox.y).toBeGreaterThan(page.viewportSize()!.height * .71);
  expect(corridorBox.width).toBeLessThan(page.viewportSize()!.width * .94);
  const speakerTag = page.locator('#corridor-player-name');
  await speakerTag.evaluate(el => { el.textContent = 'КОНСТАНТИН КОНСТАНТИНОПОЛЬСКИЙ'; });
  await contained(speakerTag, corridorFrame);
  expect(await speakerTag.evaluate(el => el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth)).toBe(true);
  for (let n = 0; n < 5; n++) await page.locator('#corridor-next').tap();
  for (const button of await page.locator('#corridor-choices button').all()) await contained(button, corridorFrame);
  await page.locator('#corridor-choices button').first().tap();
  await page.locator('#corridor-exit').tap();
  await expect(page.locator('#classroom-intro-screen')).toBeVisible();
  await settle(page);
  expect(await page.evaluate(() => (window as any).__classroomPlay.plays)).toEqual([true]);
  await expect.poll(() => page.evaluate(() => (window as any).__classroomPlay.element.currentTime)).toBeGreaterThan(0.1);
  expect(await page.evaluate(() => (window as any).__classroomPlay.element.error)).toBeNull();
  expect(await page.evaluate(() => (window as any).__classroomPlay.element.volume)).toBeGreaterThan(0.5);
  await expect(page.locator('.np-title')).toHaveText('Aria Math', { ignoreCase: true });
  await expect(page.locator('.now-playing-card')).toHaveClass(/is-visible/);
  expect((await page.locator('.now-playing-card').boundingBox())!.width).toBeLessThan(240);
  expect((await page.locator('.now-playing-card').boundingBox())!.height).toBeLessThanOrEqual(60);
  for (const selector of ['.np-title', '.np-artist', '.np-close', '.np-cover', '.np-links']) await contained(page.locator(selector), page.locator('.now-playing-card'));
  // Follow actual narrative controls through the gallery and teacher scene.
  for (let step = 0; step < 30 && !await page.locator('#teacher-intro-screen').isVisible(); step++) {
    for (const selector of ['#classroom-next', '#gallery-next', '#classmates-choices button', '#classmates-next']) {
      const next = page.locator(`${selector}:visible`).first();
      if (await next.count() && await next.isEnabled()) { await next.tap(); break; }
    }
    await page.waitForTimeout(80);
    if (await page.locator('#classroom-gallery-screen').isVisible()) {
      expect(await page.locator('.classroom-gallery-background').evaluate(el => getComputedStyle(el).backgroundSize)).toBe('cover');
    }
  }
  await expect(page.locator('#teacher-intro-screen')).toBeVisible();
  await settle(page);
  const teacherFrame = page.locator('#teacher-intro-screen .corridor-dialogue-layout');
  expect((await teacherFrame.boundingBox())!.height).toBeLessThanOrEqual(112);
  expect((await page.locator('#teacher-scene-sprite').boundingBox())!.height).toBeGreaterThan(300);
  for (const button of await page.locator('#teacher-choices button').all()) await contained(button, teacherFrame);
  await page.locator('#teacher-choices button').first().tap();
  await expect(page.locator('#teacher-choices')).toBeHidden();
  await expect.poll(async () => (await teacherFrame.boundingBox())!.height).toBeCloseTo(commonHeight, 0);
  for (let n = 0; n < 10 && !await page.locator('#exam-screen').isVisible(); n++) {
    await page.locator('#teacher-next').tap();
    await page.waitForTimeout(80);
  }
  await expect(page.locator('#exam-screen')).toBeVisible();
  await settle(page);
  const examFrame = page.locator('#exam-dialogue-panel');
  expect((await examFrame.boundingBox())!.height).toBeCloseTo(commonHeight, 0);
  expect((await page.locator('#exam-teacher-sprite').boundingBox())!.height).toBeGreaterThan(300);
  await expect.poll(() => page.locator('#exam-teacher-sprite').evaluate(el => el.getBoundingClientRect().bottom)).toBeCloseTo(page.viewportSize()!.height + 12, 0);
  await page.locator('#exam-next').tap();
  await page.locator('#exam-next').tap();
  await expect(page.locator('#exam-answer-list')).toBeVisible();
  await contained(examFrame);
  const firstAnswerBox = (await page.locator('#exam-answer-list button').first().boundingBox())!;
  expect(await page.locator('#exam-dialogue-text').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  for (const button of await page.locator('#exam-answer-list button, .exam-paper-actions button').all()) {
    await contained(button, examFrame);
    const bounds = (await button.boundingBox())!;
    expect(bounds.width).toBeCloseTo(firstAnswerBox.width, 0);
    expect(bounds.height).toBeCloseTo(firstAnswerBox.height, 0);
    expect(bounds.height).toBeLessThanOrEqual(48);
    expect(await button.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBe(14);
  }
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
  expect(await page.locator('#cameo-scene-image').evaluate(el => getComputedStyle(el).objectFit)).toBe('cover');
  await subjectAboveDialogue(page.locator('#cameo-scene-image'), [[810,100],[810,315],[905,375],[1120,490],[1190,515]]);
  expect((await page.locator('.cameo-scene-frame').boundingBox())!.y).toBe(0);
  await page.locator('#cameo-next').tap();
  await expect(page.locator('.cameo-scene-frame')).toHaveClass(/is-teacher-shot/);
  await subjectAboveDialogue(page.locator('#cameo-scene-image'), [[710,150],[910,360]]);
  await page.locator('#cameo-next').tap();
  await expect(page.locator('#cameo-scene-image')).toHaveAttribute('src', /kftm3-goodbye[.]webp$/);
  await subjectAboveDialogue(page.locator('#cameo-scene-image'), [[810,140],[810,315],[905,375],[1120,490],[1190,515]]);
  await page.locator('#cameo-next').tap();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('game:exam-scene-finished', {
    detail: { correct: 6, isExcellentEnding: true, archetype: 'ОТЛИЧНИК' },
  })));
  const toast = page.locator('#achievement-unlock-toast');
  await expect(toast).toHaveCSS('opacity', '1');
  const toastBox = (await toast.boundingBox())!;
  expect(toastBox.height).toBeLessThanOrEqual(50);
  expect(toastBox.width).toBeLessThanOrEqual(224);
  await expect(page.locator('#excellent-ending')).not.toHaveClass(/is-blackout/);
  const endingFrame = (await page.locator('#excellent-ending .corridor-dialogue-layout').boundingBox())!;
  expect(toastBox.y + toastBox.height).toBeLessThan(endingFrame.y);
  await expect(page.locator('#excellent-ending')).not.toHaveClass(/is-blackout/);
  const endingPanel = page.locator('#excellent-ending .corridor-dialogue-layout');
  await contained(page.locator('#excellent-ending-next'), endingPanel);
  await contained(page.locator('#excellent-ending-text'), endingPanel);
  expect(await page.locator('#excellent-ending-image').evaluate(el => getComputedStyle(el).objectFit)).toBe('cover');
  await expect.poll(() => page.locator('#excellent-ending-scene').evaluate(el => el.getBoundingClientRect().height)).toBe(page.viewportSize()!.height);
  for (let n = 0; n < 25 && !await page.locator('#ending-credits-video').count(); n++) await page.locator('#excellent-ending-next').tap();
  await page.locator('#ending-credits-video').evaluate(video => video.dispatchEvent(new Event('ended')));
  await expect(page.locator('#final-result-screen')).toBeVisible();
  expect(await page.locator('#final-result-screen').evaluate(el => getComputedStyle(el,'::before').content)).not.toMatch(/[↕⬆⬇]/);
  expect(await page.locator('#final-result-screen').evaluate(el => getComputedStyle(el,'::before').backgroundImage)).toContain('data:image/svg+xml');
  const book = page.locator('.final-result-book');
  await expect(book).toBeVisible();
  expect((await book.boundingBox())!.width).toBeGreaterThan(page.viewportSize()!.width * .8);
  const box = (await book.boundingBox())!;
  expect(box.width / box.height).toBeCloseTo(1671 / 941, 2);
  const archetypeField = page.locator('[data-field="archetype"]');
  for (const name of ['РАЙАН ГОСЛИНГ', 'МЕГАН ФОКС', 'НАБЛЮДАТЕЛЬ', 'НАБЛЮДАТЕЛЬНИЦА', 'УНИВЕРСАЛ', 'ОТЛИЧНИЦА']) {
    await archetypeField.evaluate((el, value) => { el.textContent = value; }, name);
    expect(await archetypeField.evaluate(el => el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth)).toBe(true);
  }
  const photo = (await page.locator('.final-result-portrait').boundingBox())!;
  const surname = (await page.locator('[data-field="surname"]').boundingBox())!;
  expect(photo.x + photo.width).toBeLessThan(surname.x);
  for (const field of await page.locator('.final-result-field').all()) {
    await field.evaluate(el => el.scrollIntoView({block:'center'}));
    await contained(field, book);
    await contained(field);
  }
  expect(await page.locator('.final-result-portrait').evaluate(el => getComputedStyle(el).objectFit)).toBe('cover');
  for (const button of await page.locator('#final-result-actions button').all()) await contained(button);
  await page.getByRole('button', { name: 'ДОСТИЖЕНИЯ', exact: true }).tap();
  await expect(page.locator('.achievements-book')).toHaveCSS('opacity', '1');
  await contained(page.locator('.achievements-book'));
  const back = page.locator('#achievements-page-overlay .achievement-back');
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
