// A Halloween beat made here, from scratch, with the Web Audio API (oscillators and noise, no samples, no recordings): 132.5 BPM, A minor,
// 4-bar loop (kick, clap, hats, bass, music-box arpeggio, organ pad, a ghostly theremin line). Starts only from a tap (autoplay rules).
export const BPM = 132.5, BEAT = 60 / BPM;
const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
const CHORDS = [[57, 60, 64], [53, 57, 60], [57, 60, 64], [52, 56, 59]];          // Am, F, Am, E (G# for the pull)
const BASS = [33, 29, 33, 28];                                                  // A1 F1 A1 E1
const ARP = [[69, 72, 76, 81, 76, 72, 76, 72], [65, 69, 72, 77, 72, 69, 72, 69], [69, 72, 76, 81, 76, 72, 76, 72], [64, 68, 71, 76, 71, 68, 71, 68]];
export class Music {
  constructor() { this.ctx = null; this.on = false; this.T0 = 0; this.nextStep = 0; this.timer = 0; }
  start() {
    if (this.on) return; const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    if (!this.ctx) {
      this.ctx = new AC(); const c = this.ctx;
      this.out = c.createGain(); this.out.gain.value = 0.0; const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
      this.out.connect(comp); comp.connect(c.destination);
      const len = c.sampleRate; this.noise = c.createBuffer(1, len, c.sampleRate); const d = this.noise.getChannelData(0); let s = 1; for (let i = 0; i < len; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823 - 1; }
      this.delay = c.createDelay(1); this.delay.delayTime.value = BEAT * 0.75; const fb = c.createGain(); fb.gain.value = 0.3; const dl = c.createGain(); dl.gain.value = 0.35;
      this.delay.connect(fb); fb.connect(this.delay); this.delay.connect(dl); dl.connect(this.out);
    }
    const c = this.ctx; c.resume(); this.on = true;
    this.out.gain.cancelScheduledValues(c.currentTime); this.out.gain.setValueAtTime(0, c.currentTime); this.out.gain.linearRampToValueAtTime(0.8, c.currentTime + 0.05);
    this.T0 = c.currentTime + 0.12; this.step = 0;                 // 16th-note steps from the loop start; the dance clock starts at T0 too
    this.timer = setInterval(() => this.pump(), 25); this.pump();
  }
  stop() {
    if (!this.on) return; this.on = false; clearInterval(this.timer); const c = this.ctx;
    this.out.gain.cancelScheduledValues(c.currentTime); this.out.gain.setValueAtTime(this.out.gain.value, c.currentTime); this.out.gain.linearRampToValueAtTime(0, c.currentTime + 0.08);
    setTimeout(() => { if (!this.on) c.suspend(); }, 200);
  }
  // seconds since the loop start, as heard (the output latency is taken off); null when the music is off
  clock() { if (!this.on) return null; const c = this.ctx; return c.currentTime - (c.outputLatency || c.baseLatency || 0) - this.T0; }
  pump() {
    const c = this.ctx, S = BEAT / 4;
    while (this.T0 + this.step * S < c.currentTime + 0.18) { this.play(this.step, this.T0 + this.step * S); this.step++; }
  }
  env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  osc(type, f, t, dur, peak, dest, a = 0.005, f2 = null) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur * 0.6);
    this.env(g, t, a, peak, dur); o.connect(g); g.connect(dest || this.out); o.start(t); o.stop(t + a + dur + 0.05); return g;
  }
  nz(t, dur, peak, type, freq, dest) {
    const c = this.ctx, s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter(); s.buffer = this.noise; f.type = type; f.frequency.value = freq; f.Q.value = 0.8;
    this.env(g, t, 0.002, peak, dur); s.connect(f); f.connect(g); g.connect(dest || this.out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  play(step, t) {
    const beat = Math.floor(step / 4), sub = step % 4, bar = Math.floor(beat / 4) % 4, inBar = step % 16, loopBeat = beat % 16;
    if (sub === 0) {                                                // kick on every beat
      this.osc('sine', 150, t, 0.22, 0.95, null, 0.002, 42);
      if (beat % 4 === 1 || beat % 4 === 3) { this.nz(t, 0.16, 0.5, 'bandpass', 1800); this.osc('triangle', 190, t, 0.1, 0.25); }   // clap on 2 and 4
    }
    if (sub === 2) this.nz(t, 0.05, 0.22, 'highpass', 7500);        // open off-beat hats
    else if (sub === 1 || sub === 3) this.nz(t, 0.02, (step % 8 === 3) ? 0.1 : 0.05, 'highpass', 9000);
    const e = inBar % 2 === 0 ? inBar / 2 : -1;                      // 8th-note position in the bar
    if ([0, 2, 3, 5, 6].includes(e)) { const n = BASS[bar] + ((e === 3 || e === 6) ? 12 : 0); const g = this.osc('sawtooth', hz(n), t, 0.2, 0.34); const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; g.disconnect(); g.connect(f); f.connect(this.out); }
    if (e >= 0) { const n = ARP[bar][e], g = this.osc('triangle', hz(n), t, 0.34, 0.2); const dd = this.ctx.createGain(); dd.gain.value = 0.5; g.connect(dd); dd.connect(this.delay); }
    if (inBar === 0) for (const n of CHORDS[bar]) {                    // organ pad, one chord per bar, soft attack
      const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter(); o.type = o2.type = 'sawtooth'; o.frequency.value = hz(n); o2.frequency.value = hz(n) * 1.004; f.type = 'lowpass'; f.frequency.value = 900;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.07, t + 0.15); g.gain.setValueAtTime(0.07, t + BEAT * 3.4); g.gain.exponentialRampToValueAtTime(0.0001, t + BEAT * 4);
      o.connect(f); o2.connect(f); f.connect(g); g.connect(this.out); o.start(t); o2.start(t); o.stop(t + BEAT * 4.1); o2.stop(t + BEAT * 4.1);
    }
    if (sub === 0) for (const [n, b0, len] of [[81, 8, 2], [76, 10, 2], [80, 12, 3]]) if (loopBeat === b0) this.ghost(hz(n), t, BEAT * len);
    if (loopBeat === 15 && sub === 0) { this.nz(t, BEAT * 1.0, 0.18, 'bandpass', 3000); }
  }
  ghost(f, t, dur) {                                                  // a theremin-like voice: sine with vibrato
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), l = c.createOscillator(), lg = c.createGain(); o.type = 'sine'; o.frequency.value = f; l.frequency.value = 5.5; lg.gain.value = f * 0.012;
    l.connect(lg); lg.connect(o.frequency); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.25); g.gain.setValueAtTime(0.12, t + dur - 0.2); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out); g.connect(this.delay); o.start(t); l.start(t); o.stop(t + dur + 0.05); l.stop(t + dur + 0.05);
  }
}
