import { expect, type Page } from '@playwright/test';

export async function selectCharacter(page: Page) {
  await page.goto('./');
  await page.locator('#start-button').click();
  await expect(page.locator('#character-screen')).toBeVisible();
  await expect(page.locator('#screen-transition')).not.toHaveClass(/is-active/);
  await expect(page.locator('#start-button')).toBeEnabled();
}

export async function openTicket(page: Page, profile: 'excellent' | 'trickster' = 'excellent') {
  await selectCharacter(page);
  await page.locator('#continue-button').click();
  await expect(page.locator('#input-screen')).toBeVisible();
  // The existing screen transition keeps its input guard for 650 ms.
  await page.waitForTimeout(700);
  await page.locator('#player-surname').fill('<img src=x onerror=alert(1)>');
  await page.locator('#player-name').fill('Тест');
  await page.locator('#player-group').fill('123');
  await page.locator('#player-form button').click();
  await expect(page.locator('#skills-screen')).toBeVisible();
  await page.waitForTimeout(550);
  const allocation = profile === 'trickster'
    ? [['cunning', 4], ['charisma', 4], ['attention', 2]] as const
    : [['knowledge', 4], ['logic', 4], ['attention', 2]] as const;
  for (const [skill, count] of allocation) {
    for (let i = 0; i < count; i++) await page.locator(`[data-skill="${skill}"] [data-delta="1"]`).click();
  }
  await page.locator('#skills-continue').click();
  await expect(page.locator('#ticket-screen')).toBeVisible();
}

export function monitor(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && new URL(response.url()).hostname === '127.0.0.1') errors.push(`${response.status()} ${response.url()}`);
  });
  return errors;
}


export async function recordCueStarts(page: Page) {
  await page.addInitScript(() => {
    (window as any).__cueStarts = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args: any[]) {
      const ending = document.getElementById('excellent-ending');
      const inEnding = ending && !ending.classList.contains('is-hidden');
      (window as any).__cueStarts.push({
        speaker: document.getElementById(inEnding ? 'excellent-ending-speaker' : 'classmates-speaker')?.textContent,
        duration: this.buffer?.duration,
        offset: args[1] ?? 0,
      });
      return start.apply(this, args as [number, number, number]);
    };
  });
}
