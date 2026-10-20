/** A small, shared cache. Only the current/next scene is prepared, never the whole game. */
const images = new Map<string, Promise<boolean>>();
const pending = new Set<string>();
const queue: Array<() => Promise<void>> = [];
let active = 0;
const MAX_BACKGROUND_REQUESTS = 2;

export function loadImage(source: string, priority: 'high' | 'low' = 'high'): Promise<boolean> {
  const cached = images.get(source);
  if (cached) return cached;
  const task = new Promise<boolean>(resolve => {
    const image = new Image();
    image.decoding = 'async';
    image.fetchPriority = priority;
    const timeout = window.setTimeout(() => finish(false), 15_000);
    let finished = false;
    function finish(ok: boolean): void {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      image.onload = image.onerror = null;
      if (!ok) images.delete(source); // Allow a later retry after transient failures.
      resolve(ok);
    }
    image.onerror = () => finish(false);
    image.onload = () => { void image.decode().then(() => finish(true), () => finish(false)); };
    image.src = source;
  });
  images.set(source, task);
  // Retain promises, not decoded Image objects; let the browser manage its image memory.
  if (images.size > 64) images.delete(images.keys().next().value!);
  return task;
}

function drain(): void {
  while (active < MAX_BACKGROUND_REQUESTS && queue.length) {
    active++;
    void queue.shift()!().finally(() => { active--; drain(); });
  }
}

export function warmImages(sources: readonly string[]): void {
  for (const source of sources) {
    if (images.has(source) || pending.has(source)) continue;
    pending.add(source);
    queue.push(async () => {
      try { await loadImage(source, 'low'); } finally { pending.delete(source); }
    });
  }
  drain();
}

let waitingScenes = 0;
export async function readyImages(sources: readonly string[]): Promise<void> {
  const status = document.getElementById('asset-loading-status');
  waitingScenes++;
  const timer = window.setTimeout(() => { if (status) status.hidden = false; }, 200);
  try {
    const results = await Promise.all(sources.map(source => loadImage(source)));
    if (results.some(ok => !ok)) console.warn('Some scene images could not be prepared; normal browser loading will retry.');
  } finally {
    window.clearTimeout(timer);
    if (--waitingScenes === 0 && status) status.hidden = true;
  }
}

/** Do not discard buffered data by assigning the same src or calling load() again. */
export function prepareMedia(audio: HTMLMediaElement | null, source?: string): void {
  if (!audio) return;
  const changed = source !== undefined && audio.src !== new URL(source, document.baseURI).href;
  const cold = audio.preload === 'none';
  if (changed) audio.src = source!;
  if (changed || cold || audio.error) {
    audio.preload = 'auto';
    // Prime enough data to start, then ask the browser to stop speculative buffering.
    // Playback ignores this hint and continues streaming normally. Never call load()
    // here: it would discard the buffer we just prepared.
    audio.addEventListener('canplay', () => {
      if (audio.paused) audio.preload = 'metadata';
    }, { once: true });
    audio.load();
  }
}

export const prepareAudio = prepareMedia;

const spriteRequests = new WeakMap<HTMLImageElement, string>();
/** Keep the previous decoded emotion visible while a replacement downloads. */
export async function swapImage(image: HTMLImageElement, source: string): Promise<void> {
  spriteRequests.set(image, source);
  if (image.getAttribute('src') === source && image.complete && image.naturalWidth) return;
  if (await loadImage(source)) {
    if (spriteRequests.get(image) === source) image.src = source;
  }
}
