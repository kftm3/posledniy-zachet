import { test, expect } from '@playwright/test';
import { selectCharacter, monitor } from './helpers';

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
    await selectCharacter(page);
    await expect(page.locator('#male-boy7-sprite')).toHaveClass(/is-visible/);
    await toggle.tap(); await page.getByRole('button', { name: 'Закрыть ввод чит-кода' }).tap();
    await expect(panel).toBeHidden();
    expect(await page.evaluate(() => visualViewport!.scale)).toBe(1);
    expect(errors).toEqual([]);
  });
});
