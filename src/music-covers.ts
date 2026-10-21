import { isPhoneLayout } from './mobile';

const covers = new Map<string, { image: HTMLImageElement; ready: Promise<HTMLImageElement | null> }>();

/** Retain only requested tiny covers, including the decoded element used by the card. */
export function prepareMusicCover(base: string, priority: 'high' | 'low' = 'low'): Promise<HTMLImageElement | null> {
  const size = isPhoneLayout() ? 36 : innerWidth <= 600 ? 58 : 68;
  const width = size * (devicePixelRatio || 1) > 128 ? 256 : 128;
  const source = base.replace(/\.webp$/, `-${width}.webp`);
  const cached = covers.get(source);
  if (cached) {
    if (priority === 'high') cached.image.fetchPriority = 'high';
    return cached.ready;
  }
  const image = new Image();
  image.decoding = 'async'; image.fetchPriority = priority; image.loading = 'eager';
  image.src = source;
  const ready = image.decode().then(() => image, () => {
    covers.delete(source);
    return null;
  });
  covers.set(source, { image, ready });
  return ready;
}
