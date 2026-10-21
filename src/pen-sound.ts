import { audioContext } from './cue-audio';

let paperNoise: AudioBuffer | null = null;

/** A quiet filtered paper scratch; generated once, so writing never waits on a file. */
export class PenSound {
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private starting = false;
  private version = 0;
  private wanted = false;
  private blocked = false;

  setWriting(writing: boolean, pressure = 1): void {
    this.wanted = writing;
    if (writing && window.AudioContext) {
      const ctx = audioContext();
      if (ctx.state === 'running') this.blocked = false;
      if (!this.starting && !this.blocked) {
        if (!this.source) this.start();
        else if (ctx.state !== 'running' && ctx.state !== 'closed') {
          this.starting = true;
          const version = this.version;
          void ctx.resume().catch(() => { if (version === this.version) this.blocked = true; }).finally(() => { if (version === this.version) this.starting = false; });
        }
      }
    }
    const ctx = this.gain?.context;
    if (ctx) this.gain!.gain.setTargetAtTime(writing ? .07 * pressure : 0, ctx.currentTime, .012);
  }

  private start(): void {
    this.starting = true;
    const version = this.version, ctx = audioContext();
    void (ctx.state === 'running' ? Promise.resolve() : ctx.resume()).then(() => {
      if (version !== this.version || !this.wanted) return;
      if (!paperNoise || paperNoise.sampleRate !== ctx.sampleRate) {
        paperNoise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const samples = paperNoise.getChannelData(0);
        let seed = 173, grain = 0;
        for (let i=0; i<samples.length; i++) {
          seed = (Math.imul(seed,1664525)+1013904223) >>> 0;
          const noise = seed/2147483648-1;
          grain = grain*.7 + noise*.3;
          samples[i] = noise*.6 + grain*.4;
        }
      }
      const source = ctx.createBufferSource(), high = ctx.createBiquadFilter(), low = ctx.createBiquadFilter(), gain = ctx.createGain();
      source.buffer = paperNoise; source.loop = true;
      high.type = 'highpass'; high.frequency.value = 550;
      low.type = 'lowpass'; low.frequency.value = 5500;
      gain.gain.value = 0;
      source.connect(high).connect(low).connect(gain).connect(ctx.destination);
      this.source = source; this.gain = gain;
      source.onended = () => { source.disconnect(); high.disconnect(); low.disconnect(); gain.disconnect(); };
      source.start();
    }).catch(() => { if (version === this.version) this.blocked = true; }).finally(() => { if (version === this.version) this.starting = false; });
  }

  stop(): void {
    this.version++; this.wanted = false; this.starting = false;
    if (this.source && this.gain) {
      const ctx = this.gain.context, gain = this.gain.gain;
      gain.cancelScheduledValues(ctx.currentTime);
      gain.setTargetAtTime(0,ctx.currentTime,.008);
      this.source.stop(ctx.currentTime+.04);
    }
    this.source = null; this.gain = null;
  }
}
