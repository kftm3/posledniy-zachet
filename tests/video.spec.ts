import { test, expect } from '@playwright/test';

test('classroom MP3 has a valid range response and decodes from a direct gesture', async ({ page }) => {
  const source = 'audio/classroom/C418-Aria_Math-clean.mp3';
  const response = await page.request.get(source, { headers: { Range: 'bytes=0-1023' } });
  expect(response.status()).toBe(206);
  expect(response.headers()['content-type']).toContain('audio/mpeg');
  const bytes = await response.body();
  expect(bytes[0]).toBe(0xff);
  expect(bytes[1] & 0xe0).toBe(0xe0);
  await page.goto('./');
  await page.evaluate(source => {
    const button = document.createElement('button');
    button.id = 'music-decode-start'; button.textContent = 'Play classroom test';
    Object.assign(button.style, { position: 'fixed', zIndex: '2147483647', top: '0' });
    const audio = new Audio(source); audio.id = 'music-decode-check';
    document.body.append(button, audio);
    button.onclick = () => { void audio.play(); };
  }, source);
  await page.locator('#music-decode-start').click();
  const audio = page.locator('#music-decode-check');
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(0.1);
  expect(await audio.evaluate((el: HTMLAudioElement) => el.error)).toBeNull();
  expect(await audio.evaluate((el: HTMLAudioElement) => el.duration)).toBeCloseTo(309.936, 1);
});

test('optimized videos decode, advance and reach their actual end in Chromium', async ({ page }) => {
  await page.goto('./');
  for (const [path, width, height, duration] of [
    ['video/last-exam-intro.mp4', 1920, 1072, 13.531667],
    ['assets/endings/credits-v2.mp4', 1920, 880, 27.2],
  ] as const) {
    const range = await page.request.get(path, { headers: { Range: 'bytes=0-1023' } });
    expect(range.status()).toBe(206);
    expect(range.headers()['content-type']).toContain('video/mp4');
    expect((await range.body()).subarray(4, 8).toString()).toBe('ftyp');
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
