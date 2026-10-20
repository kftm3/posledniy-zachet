/** Switch scenes only when the cover is opaque, then reveal the painted frame. */
import { readyImages } from './asset-loading';

const painted = () => new Promise<void>(resolve =>
  requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

async function settle(overlay: HTMLElement): Promise<void> {
  await painted();
  await Promise.all(overlay.getAnimations().map(animation => animation.finished.catch(() => {})));
}

export async function coverScene(): Promise<void> {
  const overlay = document.getElementById('screen-transition');
  if (!overlay) return;
  overlay.classList.remove('is-revealing', 'is-black-intro');
  overlay.setAttribute('aria-hidden', 'false');
  overlay.classList.add('is-active');
  await settle(overlay);
}

export async function revealScene(): Promise<void> {
  const overlay = document.getElementById('screen-transition');
  if (!overlay) return;
  await painted();
  overlay.classList.remove('is-active', 'is-revealing', 'is-black-intro');
  await settle(overlay);
  overlay.setAttribute('aria-hidden', 'true');
}

export async function transitionScene(change: () => void | Promise<void>, assets: readonly string[] = []): Promise<void> {
  // Keep the outgoing scene visible while its replacement downloads.
  await readyImages(assets);
  await coverScene();
  try { await change(); } finally { await revealScene(); }
}
