import { test, expect } from '@playwright/test';
import { selectCharacter, openTicket, monitor } from './helpers';

for (const phone of [false, true]) {
  test.describe(phone ? 'phone ticket portrait' : 'desktop ticket portrait', () => {
    test.use({ viewport: phone ? { width: 874, height: 353 } : { width: 1280, height: 800 }, isMobile: phone, hasTouch: phone, deviceScaleFactor: phone ? 3 : 1 });
    test('selected thumbnail is ready before identity entry and reused on the ticket', async ({ page }) => {
      const requests: string[] = [];
      page.on('request', request => requests.push(request.url()));
      const errors = monitor(page);
      await page.route('**/characters/*/card.webp', route => route.abort());
      await selectCharacter(page);
      await page.locator('.female-panel .portrait-slot[data-index="2"]').click();
      await page.locator('#continue-button').click();
      await expect(page.locator('#input-screen')).toBeVisible();
      await expect(page.locator('#screen-transition')).toHaveAttribute('aria-hidden', 'true');
      const photo = page.locator('#ticket-photo');
      await expect.poll(() => photo.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
      const source = await photo.evaluate((el: HTMLImageElement) => el.currentSrc);
      expect(source).toMatch(/student_girl3\/card-(256|512)\.webp$/);
      const before = requests.filter(url => url.includes('/student_girl3/card-')).length;
      await page.locator('#player-surname').fill('Иванова');
      await page.locator('#player-name').fill('Анна');
      await page.locator('#player-group').fill('123');
      await page.locator('#player-form button').click();
      await expect(page.locator('#skills-screen')).toBeVisible();
      await expect(page.locator('#screen-transition')).toHaveAttribute('aria-hidden', 'true');
      for (const [skill, count] of [['knowledge', 4], ['logic', 4], ['attention', 2]] as const) {
        for (let n = 0; n < count; n++) await page.locator(`[data-skill="${skill}"] [data-delta="1"]`).click();
      }
      await page.locator('#skills-continue').click();
      await expect(page.locator('#ticket-screen')).toBeVisible();
      expect(await photo.evaluate((el: HTMLImageElement) => el.currentSrc)).toBe(source);
      expect(await photo.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
      expect(requests.filter(url => url.includes('/student_girl3/card-')).length).toBe(before);
      expect(requests.filter(url => /\/characters\/[^/]+\/card\.webp$/.test(url))).toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}

test('desktop keyboard codes still toggle secret characters', async ({ page }) => {
  await selectCharacter(page);
  await expect(page.locator('#character-cheat-toggle')).toBeHidden();
  await page.keyboard.type('hesoyam');
  await expect(page.locator('.portrait-slot[data-secret="cj"]')).toBeVisible();
  await page.keyboard.type('hesoyam');
  await expect(page.locator('.portrait-slot[data-secret="cj"]')).toBeHidden();
});

test.describe('phone cheat input', () => {
  test.use({ viewport: { width: 874, height: 353 }, isMobile: true, hasTouch: true });
  test('question button accepts codes on submit, selects secret heroes and persists the unlock', async ({ page }) => {
    const errors = monitor(page);
    await selectCharacter(page);
    const toggle = page.getByRole('button', { name: 'Ввести чит-код', exact: true });
    const panel = page.locator('#character-cheat-panel');
    const input = page.locator('#character-cheat-input');
    const regularBefore = await page.locator('.male-panel .portrait-slot:not([data-secret])').evaluateAll(elements => elements.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));
    await toggle.tap();
    await page.setViewportSize({ width: 874, height: 180 }); // Visual space remaining above a landscape keyboard.
    await expect.poll(() => panel.evaluate(el => el.getBoundingClientRect().height)).toBe(180);
    await input.fill('unknown');
    await page.getByRole('button', { name: 'ПРИМЕНИТЬ' }).tap();
    await expect(page.locator('#character-cheat-status')).toHaveText(/не распознан/);
    await page.setViewportSize({ width: 874, height: 353 });
    await input.fill('');
    await input.pressSequentially('hesoyam');
    expect(await page.evaluate(() => localStorage.getItem('last-exam-hesoyam-unlocked'))).toBeNull();
    await page.getByRole('button', { name: 'ПРИМЕНИТЬ' }).tap();
    await expect(panel).toBeHidden();
    await expect(page.locator('#male-boy6-sprite')).toHaveClass(/is-visible/);
    expect(await page.evaluate(() => localStorage.getItem('last-exam-hesoyam-unlocked'))).toBe('true');
    await toggle.tap(); await input.fill(' DEVIL '); await input.press('Enter');
    await expect(panel).toBeHidden();
    await expect(page.locator('#male-boy7-sprite')).toHaveClass(/is-visible/);
    const regular = page.locator('.male-panel .portrait-slot:not([data-secret])');
    await expect(regular).toHaveCount(5);
    const regularAfter = await regular.evaluateAll(elements => elements.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));
    for(let n=0;n<5;n++)for(const key of ['x','y','width','height'] as const)expect(regularAfter[n][key]).toBeCloseTo(regularBefore[n][key],0);
    for(const secret of await page.locator('.male-panel .portrait-slot[data-secret]').all()) {
      const box = (await secret.boundingBox())!;
      expect(box.y).toBeGreaterThan(regularAfter[0].y + regularAfter[0].height);
      expect(box.y + box.height).toBeLessThan(page.viewportSize()!.height);
      expect(await secret.evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===el;})).toBe(true);
      await secret.tap();await expect(secret).toHaveClass(/is-selected/);
    }
    await page.locator('.portrait-slot[data-secret="devil"]').tap();
    await selectCharacter(page);
    await expect(page.locator('#male-boy7-sprite')).toHaveClass(/is-visible/);
    await toggle.tap(); await page.getByRole('button', { name: 'Закрыть ввод чит-кода' }).tap();
    await expect(panel).toBeHidden();
    expect(await page.evaluate(() => visualViewport!.scale)).toBe(1);
    expect(errors).toEqual([]);
  });
});


test.describe('phone layout detection', () => {
  test.use({viewport:{width:980,height:430},isMobile:true,hasTouch:false,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
  test('the cheat button remains reachable when the phone reports a fine pointer', async ({page}) => {
    await selectCharacter(page);
    expect(await page.evaluate(()=>matchMedia('(pointer:coarse)').matches)).toBe(false);
    await expect(page.locator('html')).toHaveClass(/phone-layout/);
    const toggle=page.locator('#character-cheat-toggle');
    await expect(toggle).toBeVisible();
    expect(await toggle.evaluate(el=>{
      const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('#character-cheat-toggle')===el;
    })).toBe(true);
    await toggle.click();
    await expect(page.locator('#character-cheat-panel')).toBeVisible();
    await page.locator('#character-cheat-input').fill('DEVIL');
    await page.locator('.character-cheat-submit').click();
    await expect(page.locator('#male-boy7-sprite')).toHaveClass(/is-visible/);
    await page.setViewportSize({width:1170,height:430});
    await expect(toggle).toBeVisible();
  });
});

test.describe('phone ticket zoom', () => {
  test.use({viewport:{width:874,height:353},isMobile:true,hasTouch:true,deviceScaleFactor:3});
  test('the full-size ticket scrolls and its fields stay attached to the artwork during zoom and resize',async ({page})=>{
    await openTicket(page);
    const viewport=page.locator('.ticket-viewport'),ticket=page.locator('.ticket-wrap');
    await expect(ticket).toBeVisible();
    expect(await viewport.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
    const normalized=()=>ticket.evaluate(root=>{
      const art=root.querySelector('.ticket-art')!.getBoundingClientRect();
      return [...root.querySelectorAll('.ticket-photo,.ticket-field-value,.ticket-archetype-name,.ticket-archetype-description')].map(el=>{
        const r=el.getBoundingClientRect();return [(r.x-art.x)/art.width,(r.y-art.y)/art.height,r.width/art.width,r.height/art.height];
      });
    });
    const before=await normalized();
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:2});
    expect(await page.evaluate(()=>visualViewport!.scale)).toBe(2);
    expect(await normalized()).toEqual(before);
    await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});
    await page.setViewportSize({width:812,height:320});
    await ticket.evaluate(el=>{el.tabIndex=-1;el.focus();});
    expect(await ticket.evaluate(el=>getComputedStyle(el).transform)).toBe('none');
    expect((await ticket.boundingBox())!.width).toBeGreaterThan(760);
    const after=await normalized();
    for(let n=0;n<before.length;n++)for(let d=0;d<4;d++)expect(after[n][d]).toBeCloseTo(before[n][d],2);
    await viewport.evaluate(el=>el.scrollTop=el.scrollHeight);
    expect(await viewport.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
    await expect(page.locator('#ticket-start')).toBeVisible();
    await expect(page.locator('#ticket-back')).toBeVisible();
  });
});
