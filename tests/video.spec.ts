import { test, expect } from '@playwright/test';

test('optimized videos decode, advance and reach their actual end in Chromium', async ({ page }) => {
  await page.goto('./');
  for (const [path, width, height, duration] of [
    ['video/last-exam-intro.mp4', 1920, 1072, 13.531667],
    ['assets/endings/credits.mp4', 1114, 512, 67.866667],
  ] as const) {
    await page.evaluate(async source => {
      const video = document.createElement('video');
      video.id = 'decode-check';
      video.muted = true;
      video.playsInline = true;
      video.src = source;
      document.body.append(video);
      await video.play();
    }, path);
    const video = page.locator('#decode-check');
    await expect(video).toHaveJSProperty('videoWidth', width);
    await expect(video).toHaveJSProperty('videoHeight', height);
    const actualDuration = await video.evaluate((v: HTMLVideoElement) => v.duration);
    expect(Math.abs(actualDuration - duration)).toBeLessThan(0.1);
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0.1);
    await video.evaluate((v: HTMLVideoElement) => { v.currentTime = v.duration - 0.25; });
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.ended)).toBe(true);
    await video.evaluate((v: HTMLVideoElement) => { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); });
  }
});
