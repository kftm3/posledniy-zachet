/** Set preload BEFORE src: late-scene audio must not compete with the first screen. */
export function createAudio(source?: string): HTMLAudioElement {
  const audio = new Audio();
  audio.preload = 'none';
  if (source) audio.src = source;
  return audio;
}
