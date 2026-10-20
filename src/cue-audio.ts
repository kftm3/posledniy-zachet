/** Short narrative cues are downloaded and decoded before their dialogue. */
let context: AudioContext | null = null;
function audioContext(): AudioContext {
  return context ??= new AudioContext();
}

export function unlockCueAudio(): void {
  if (!window.AudioContext) return;
  void audioContext().resume().catch(() => {});
}

export class AudioCue {
  private buffer: AudioBuffer | null = null;
  private preparing: Promise<void> | null = null;
  private source: AudioBufferSourceNode | null = null;
  private version = 0;

  constructor(private readonly url: string, private readonly volume = 1, private readonly offset = 0) {}

  prepare(): Promise<void> {
    if (this.buffer) return Promise.resolve();
    if (this.preparing) return this.preparing;
    this.preparing = (async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch(this.url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Cue request failed: ${response.status}`);
        this.buffer = await audioContext().decodeAudioData(await response.arrayBuffer());
      } catch (error) {
        console.warn('Narrative sound could not be prepared:', error);
      } finally {
        window.clearTimeout(timeout);
        this.preparing = null;
      }
    })();
    return this.preparing;
  }

  play(): void {
    this.stop();
    const version = this.version;
    const buffer = this.buffer;
    // Never start a network request here: a late cue belongs to an old line.
    if (!buffer) return;
    const ctx = audioContext();
    void ctx.resume().then(() => {
      if (version !== this.version) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = this.volume;
      source.buffer = buffer;
      source.connect(gain).connect(ctx.destination);
      this.source = source;
      source.onended = () => { source.disconnect(); gain.disconnect(); if (this.source === source) this.source = null; };
      source.start(0, this.offset);
    }).catch(() => {});
  }

  stop(): void {
    this.version++;
    if (this.source) { this.source.stop(); this.source = null; }
  }
}
