/** A small, shared cache. Only the current/next scene is prepared, never the whole game. */
const images = new Map<string, Promise<boolean>>();
const inflight = new Map<string, HTMLImageElement>();
const decoded = new Map<string, HTMLImageElement>();
let decodedBytes = 0;
const MAX_DECODED_BYTES = 32 * 1024 * 1024;
const pending = new Set<string>();
const queue: Array<() => Promise<void>> = [];
let active = 0;
const MAX_BACKGROUND_REQUESTS = 2;

export function loadImage(source: string, priority: 'high' | 'low' = 'high'): Promise<boolean> {
  const cached = images.get(source);
  if (cached) {
    // A completed request is not proof that its decoded bitmap is still resident.
    // Re-decode required artwork from the browser cache before revealing a scene.
    if (priority === 'high' && !inflight.has(source) && !decoded.has(source)) {
      images.delete(source);
      return loadImage(source, priority);
    }
    // A background request can become necessary for the very next dialogue.
    if (priority === 'high') inflight.get(source)?.setAttribute('fetchpriority', 'high');
    const retained = decoded.get(source);
    if (retained) { decoded.delete(source); decoded.set(source, retained); }
    return cached;
  }
  const task = new Promise<boolean>(resolve => {
    const image = new Image();
    image.decoding = 'async';
    image.fetchPriority = priority;
    inflight.set(source, image);
    const timeout = window.setTimeout(() => finish(false), 15_000);
    let finished = false;
    function finish(ok: boolean): void {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      image.onload = image.onerror = null;
      if (inflight.get(source) === image) inflight.delete(source);
      if (!ok) images.delete(source); // Allow a later retry after transient failures.
      else {
        // Retain a bounded working set so changing emotion doesn't immediately
        // discard the image we decoded offscreen. Never retain the entire game.
        const previous = decoded.get(source);
        if (previous) decodedBytes -= previous.naturalWidth * previous.naturalHeight * 4;
        decoded.delete(source);
        decoded.set(source, image);
        decodedBytes += image.naturalWidth * image.naturalHeight * 4;
        while (decodedBytes > MAX_DECODED_BYTES && decoded.size) {
          const oldest = decoded.keys().next().value!;
          const oldImage = decoded.get(oldest)!;
          decodedBytes -= oldImage.naturalWidth * oldImage.naturalHeight * 4;
          decoded.delete(oldest);
        }
      }
      resolve(ok);
    }
    image.onerror = () => finish(false);
    image.onload = () => { void image.decode().then(() => finish(true), () => finish(false)); };
    image.src = source;
  });
  images.set(source, task);
  // Request bookkeeping is separate from the bounded decoded working set.
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
    const enoughBuffer = () => {
      if (!audio.paused) { cleanup(); return; }
      const target = Math.min(audio.duration || Infinity, audio instanceof HTMLVideoElement ? 4 : 2);
      if (audio.buffered.length && audio.buffered.end(0) >= target) {
        audio.preload = 'metadata';
        cleanup();
      }
    };
    const cleanup = () => {
      audio.removeEventListener('progress', enoughBuffer);
      audio.removeEventListener('canplay', enoughBuffer);
      audio.removeEventListener('play', cleanup);
      audio.removeEventListener('error', cleanup);
    };
    audio.load();
    audio.addEventListener('progress', enoughBuffer);
    audio.addEventListener('canplay', enoughBuffer);
    audio.addEventListener('play', cleanup, { once: true });
    audio.addEventListener('error', cleanup, { once: true });
  }
}

export const prepareAudio = prepareMedia;

const spriteRequests = new WeakMap<HTMLImageElement, string>();
/** Keep the previous decoded emotion visible while a replacement downloads. */
export async function swapImage(image: HTMLImageElement, source: string): Promise<void> {
  spriteRequests.set(image, source);
  image.loading = 'eager';
  if (image.getAttribute('src') === source && image.complete && image.naturalWidth) return;
  let loaded = await loadImage(source);
  if (!loaded && spriteRequests.get(image) === source) loaded = await loadImage(source);
  if (loaded) {
    if (spriteRequests.get(image) === source) image.src = source;
  }
}
