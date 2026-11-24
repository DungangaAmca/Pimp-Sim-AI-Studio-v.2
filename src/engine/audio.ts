/**
 * Zero-404 Procedural Web Audio Synthesizer
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private clapBuffer: AudioBuffer | null = null;
  public muted = false;

  private ensureCtx(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private ensureClapBuffer(ctx: AudioContext): AudioBuffer {
    if (this.clapBuffer && this.clapBuffer.sampleRate === ctx.sampleRate) {
      return this.clapBuffer;
    }
    const len = Math.floor(ctx.sampleRate * 0.11);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, 2.2);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    this.clapBuffer = buffer;
    return buffer;
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
  }

  public playClick() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520 + (Math.random() - 0.5) * 40, now);
    osc.frequency.exponentialRampToValueAtTime(240, now + 0.05);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  public playCash() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [880, 1318.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.07);
      gain.gain.setValueAtTime(0.11, now + idx * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + 0.19);
    });
  }

  public playHit(heavy = false) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(heavy ? 140 : 210, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + (heavy ? 0.18 : 0.1));
    gain.gain.setValueAtTime(heavy ? 0.18 : 0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.2 : 0.11));
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + (heavy ? 0.21 : 0.12));
  }

  public playAlert() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.linearRampToValueAtTime(640, now + 0.15);
    osc.frequency.linearRampToValueAtTime(420, now + 0.3);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.33);
  }

  public playVictory() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.11);
      gain.gain.setValueAtTime(0.12, now + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.11 + 0.32);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + idx * 0.11);
      osc.stop(now + idx * 0.11 + 0.34);
    });
  }

  /**
   * Procedural room applause burst (staggered filtered clap transients).
   */
  public playApplause(volume = 0.32) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const buf = this.ensureClapBuffer(ctx);
    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    const clampedVol = Math.min(0.45, Math.max(0.04, volume));
    masterGain.gain.setValueAtTime(clampedVol, now);
    masterGain.connect(ctx.destination);

    const clapCount = 14;
    for (let i = 0; i < clapCount; i++) {
      const offset = i * 0.064 + (Math.random() - 0.5) * 0.028;
      const start = Math.max(now, now + offset);

      const src = ctx.createBufferSource();
      src.buffer = buf;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(900 + Math.random() * 1100, start);
      filter.Q.setValueAtTime(1.4 + Math.random() * 1.1, start);

      const gain = ctx.createGain();
      const peak = 0.25 + Math.random() * 0.25;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(peak, start + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.085);

      src.connect(filter).connect(gain).connect(masterGain);
      src.start(start);
      src.stop(start + 0.095);
    }
  }
}

export const soundEngine = new SoundEngine();
