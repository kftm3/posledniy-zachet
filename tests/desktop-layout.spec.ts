import { test, expect, type Locator } from '@playwright/test';
import { continueAfterCredits, selectCharacter, openTicket, monitor } from './helpers';

async function inside(child: Locator, parent: Locator) {
  await expect(child).toBeVisible();
  const c = (await child.boundingBox())!, p = (await parent.boundingBox())!;
  expect(c.x).toBeGreaterThanOrEqual(p.x - 1);
  expect(c.y).toBeGreaterThanOrEqual(p.y - 1);
  expect(c.x + c.width).toBeLessThanOrEqual(p.x + p.width + 1);
  expect(c.y + c.height).toBeLessThanOrEqual(p.y + p.height + 1);
}

for (const viewport of [{width:1280,height:720}, {width:1920,height:1080}, {width:2560,height:1440}, {width:3440,height:1440}, {width:3840,height:2160}]) {
  test(`desktop dialogue, long questions and result texture fit ${viewport.width}×${viewport.height}`, async ({page}) => {
    await page.setViewportSize(viewport);
    const errors = monitor(page);
    await selectCharacter(page);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('game:exam-intro-requested')));
    await expect(page.locator('#exam-screen')).toBeVisible();
    await expect(page.locator('#screen-transition')).toHaveAttribute('aria-hidden', 'true');
    const frame = page.locator('#exam-dialogue-panel');
    const next = page.locator('#exam-next');
    const speaker = page.locator('#exam-speaker');
    await speaker.evaluate(el => { el.textContent = 'КОНСТАНТИН КОНСТАНТИНОПОЛЬСКИЙ'; });
    await inside(speaker, frame);
    expect(await speaker.evaluate(el => el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth)).toBe(true);
    await inside(next, frame);
    const f = (await frame.boundingBox())!, b = (await next.boundingBox())!;
    expect(f.x + f.width - b.x - b.width).toBeLessThan(viewport.width * .04);
    expect(f.y + f.height - b.y - b.height).toBeLessThan(viewport.height * .04);
    if(viewport.width >= 1600) expect((await page.locator('#exam-teacher-sprite').boundingBox())!.height).toBeLessThan(viewport.height * .85);
    const text = page.locator('#exam-dialogue-text');
    const font = await text.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    expect(font).toBeGreaterThanOrEqual(Math.min(viewport.width, viewport.height) * .018);
    await next.click(); await next.click();
    const answers = page.locator('#exam-answer-list');
    await expect(answers).toBeVisible();
    await expect.poll(() => frame.evaluate(el => el.getBoundingClientRect().height)).toBeLessThanOrEqual(viewport.height * .5);
    await expect.poll(()=>text.evaluate(el=>parseFloat(getComputedStyle(el).paddingLeft))).toBeGreaterThanOrEqual(10);
    await expect.poll(() => text.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan(font);
    await text.evaluate(el => { el.textContent = 'Очень длинная формулировка экзаменационного вопроса, которая должна переноситься на несколько строк и оставаться отдельно от кнопок действий и вариантов ответа. '.repeat(5); });
    await inside(text, frame);
    await expect.poll(() => page.evaluate(() => {
      const question=document.getElementById('exam-dialogue-text')!.getBoundingClientRect();
      return question.bottom < document.getElementById('exam-answer-list')!.getBoundingClientRect().top
        && question.bottom < document.querySelector('.exam-paper-actions')!.getBoundingClientRect().top;
    })).toBe(true);
    expect(await text.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await text.evaluate(el => el.scrollHeight)).toBeGreaterThan(font * 3);
    const answerButton = (await page.locator('#exam-answer-list button').first().boundingBox())!;
    expect(answerButton.height).toBeLessThan(viewport.height * .1);
    expect(await text.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan(font);
    for (const button of await page.locator('#exam-answer-list button,.exam-paper-actions button').all()) {
      await inside(button, frame);
      const bounds = (await button.boundingBox())!;
      expect(bounds.width).toBeCloseTo(answerButton.width, 0);
      expect(bounds.height).toBeCloseTo(answerButton.height, 0);
    }
    await page.locator('#exam-answer-list button').first().click();
    await expect(page.locator('#exam-screen')).not.toHaveClass(/exam-paper-open/);
    await inside(next, frame);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('game:exam-scene-finished', {detail:{correct:6,isExcellentEnding:true,archetype:'ОТЛИЧНИК'}})));
    const endingFrame = page.locator('#excellent-ending .corridor-dialogue-layout');
    await inside(page.locator('#excellent-ending-next'), endingFrame);
    const en = (await page.locator('#excellent-ending-next').boundingBox())!, ef = (await endingFrame.boundingBox())!;
    expect(ef.x + ef.width / 2).toBeCloseTo(viewport.width / 2, 0);
    expect(ef.x + ef.width - en.x - en.width).toBeCloseTo(f.x + f.width - b.x - b.width, 0);
    expect(ef.y + ef.height - en.y - en.height).toBeCloseTo(f.y + f.height - b.y - b.height, 0);
    for (let n = 0; n < 25 && !await page.locator('#ending-credits-video').count(); n++) await page.locator('#excellent-ending-next').click();
    await page.locator('#ending-credits-video').evaluate(video => video.dispatchEvent(new Event('ended')));
    await continueAfterCredits(page);
    const book = page.locator('.final-result-book');
    await expect(book).toBeVisible();
    const bookBox = (await book.boundingBox())!;
    expect(bookBox.width / bookBox.height).toBeCloseTo(1671/941, 3);
    expect(bookBox.y).toBeGreaterThanOrEqual(0);
    const portrait = page.locator('.final-result-portrait'), photoBox = (await portrait.boundingBox())!;
    expect((photoBox.x - bookBox.x) / bookBox.width).toBeCloseTo(.105, 2);
    expect((photoBox.y - bookBox.y) / bookBox.height).toBeCloseTo(.315, 2);
    expect(photoBox.x + photoBox.width).toBeLessThan((await page.locator('[data-field="surname"]').boundingBox())!.x);
    for (const field of await page.locator('.final-result-field').all()) await inside(field, book);
    expect(errors).toEqual([]);
  });
}

for (const viewport of [{width:1280,height:720}, {width:3840,height:2160}]) {
  test(`story controls share the lower right corner at ${viewport.width}×${viewport.height}`, async ({page}) => {
    await page.setViewportSize(viewport);
    await openTicket(page);
    await page.locator('#ticket-start').click(); await page.locator('#intro-video-skip').click();
    await expect(page.locator('#corridor-screen')).toBeVisible();
    const check = async (button: string, frame: string) => {
      await inside(page.locator(button), page.locator(frame));
      const b = (await page.locator(button).boundingBox())!, f = (await page.locator(frame).boundingBox())!;
      expect(f.x + f.width - b.x - b.width).toBeLessThan(viewport.width * .04);
      expect(f.y + f.height - b.y - b.height).toBeLessThan(viewport.height * .04);
    };
    await check('#corridor-next', '#corridor-screen .corridor-dialogue-layout');
    for(let n=0;n<5;n++) await page.locator('#corridor-next').click();
    for(const button of await page.locator('#corridor-choices button').all()) await inside(button, page.locator('#corridor-screen .corridor-dialogue-layout'));
    await page.locator('#corridor-choices button').first().click();
    await check('#corridor-exit', '#corridor-screen .corridor-dialogue-layout');
    await page.locator('#corridor-exit').click();
    await expect(page.locator('#classroom-intro-screen')).toBeVisible();
    for(let step=0;step<30&&!await page.locator('#teacher-intro-screen').isVisible();step++) {
      await expect(page.locator('#screen-transition')).toHaveAttribute('aria-hidden','true');
      for(const id of ['classroom','gallery','classmates']) {
        const button = page.locator(`#${id}-next:visible`);
        if(await button.count() && await button.isEnabled()) {
          const frame = id==='classroom'?'#classroom-intro-screen .corridor-dialogue-layout':`.${id}-dialogue-layout`;
          await check(`#${id}-next`,frame);
          await button.click(); break;
        }
      }
      await page.waitForTimeout(80);
    }
    await expect(page.locator('#teacher-intro-screen')).toBeVisible();
    await expect(page.locator('#screen-transition')).toHaveAttribute('aria-hidden','true');
    const teacherFrame=page.locator('#teacher-intro-screen .corridor-dialogue-layout');
    await inside(page.locator('#teacher-speaker'),teacherFrame);
    expect(await page.locator('#teacher-speaker').evaluate(el=>el.scrollHeight<=el.clientHeight&&el.scrollWidth<=el.clientWidth)).toBe(true);
    for(const button of await page.locator('#teacher-choices button').all()) await inside(button,teacherFrame);
    await page.locator('#teacher-choices button').first().click();
    await check('#teacher-next','#teacher-intro-screen .corridor-dialogue-layout');
  });
}


test('character selection sprites stay slightly smaller on large monitors',async({page})=>{
  for(const viewport of [{width:2560,height:1440},{width:3840,height:2160}]){
    await page.setViewportSize(viewport);await selectCharacter(page);
    for(const [gender,selector] of [['male','#male-boy1-sprite'],['female','#female-girl1-sprite']] as const){
      await page.locator(`.${gender}-panel .portrait-slot[data-index="0"]`).click();
      await expect(page.locator(selector)).toHaveClass(/is-visible/);
      await expect.poll(()=>page.locator(selector).evaluate(el=>el.getBoundingClientRect().height)).toBeCloseTo(viewport.height*1.16,0);
      const box=(await page.locator(selector).boundingBox())!;
      expect(box.y).toBeGreaterThan(-viewport.height*.05);
      expect(box.y).toBeLessThan(viewport.height*.2);
    }
  }
});
