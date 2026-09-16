/* ============================================================
   Nightscape — procedural WebAudio score for Lantern Keeper
   Ambient bed (wind / crickets / water / pad) + game SFX.
   ============================================================ */

const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98];

function noiseBuffer(ctx, kind, seconds = 3) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let last = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === "white") {
        d[i] = w * 0.6;
      } else if (kind === "brown") {
        last = (last + 0.02 * w) / 1.02;
        d[i] = Math.max(-1, Math.min(1, last * 3.4));
      } else {
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.12;
        b6 = w * 0.115926;
      }
    }
  }
  return buf;
}

export class Nightscape {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.enabled = false;
    this.volume = 0.6;
    this._nodes = {};
    this._next = { cricket: 0, lap: 0, fly: 0 };
    this._timer = null;
    this._intensity = 0;
  }

  async enable() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (!this.ready) this._build();
    this.enabled = true;
    this._ramp(this._nodes.master.gain, this.volume, 2.2);
    this._schedule();
    return true;
  }

  disable() {
    this.enabled = false;
    if (!this.ctx || !this.ready) return;
    this._ramp(this._nodes.master.gain, 0.0001, 0.8);
    clearTimeout(this._timer);
    this._timer = null;
  }

  async toggle() {
    if (this.enabled) { this.disable(); return false; }
    return await this.enable();
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.enabled && this.ready) this._ramp(this._nodes.master.gain, this.volume, 0.15);
  }

  /** 0..1 — raises tension as the lantern dims / phases climb */
  setIntensity(v) {
    this._intensity = Math.max(0, Math.min(1, v));
    if (!this.ready || !this.enabled) return;
    const t = this.ctx.currentTime + 0.8;
    this._nodes.crickets.gain.linearRampToValueAtTime(0.5 + this._intensity * 0.5, t);
    this._nodes.padFilter.frequency.linearRampToValueAtTime(420 + this._intensity * 900, t);
  }

  _ramp(param, to, sec) {
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(Math.max(0.0001, param.value), now);
    param.linearRampToValueAtTime(Math.max(0.0001, to), now + sec);
  }

  _build() {
    const ctx = this.ctx;
    this.brown = noiseBuffer(ctx, "brown", 4);
    this.pink = noiseBuffer(ctx, "pink", 4);
    this.white = noiseBuffer(ctx, "white", 2);

    const master = ctx.createGain();
    master.gain.value = 0.0001;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 14; comp.ratio.value = 3;
    comp.attack.value = 0.02; comp.release.value = 0.28;

    master.connect(comp).connect(ctx.destination);

    const wind = ctx.createGain(); wind.gain.value = 0.6;
    const crickets = ctx.createGain(); crickets.gain.value = 0.5;
    const water = ctx.createGain(); water.gain.value = 0.35;
    const pad = ctx.createGain(); pad.gain.value = 0.5;
    [wind, crickets, water, pad].forEach((g) => g.connect(master));

    this._nodes = { master, wind, crickets, water, pad };

    // --- wind: two filtered brown-noise beds
    [[-0.6, 520, 0.07], [0.6, 740, 0.05]].forEach(([pan, cut, lfoHz]) => {
      const src = ctx.createBufferSource();
      src.buffer = this.brown; src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.7; lp.frequency.value = cut;
      this._lfo(lfoHz, 260, lp.frequency, cut);
      const g = ctx.createGain(); g.gain.value = 0.22;
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      src.connect(lp).connect(g).connect(p).connect(wind);
      src.start();
    });

    // --- water bed
    const wsrc = ctx.createBufferSource();
    wsrc.buffer = this.pink; wsrc.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 340; bp.Q.value = 0.85;
    this._lfo(0.09, 90, bp.frequency, 340);
    const wg = ctx.createGain(); wg.gain.value = 0.17;
    wsrc.connect(bp).connect(wg).connect(water);
    wsrc.start();

    // --- pad (low drone + delay)
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = "lowpass"; padFilter.Q.value = 0.8; padFilter.frequency.value = 520;
    this._lfo(0.04, 180, padFilter.frequency, 520);
    this._nodes.padFilter = padFilter;

    const delay = ctx.createDelay(1.2); delay.delayTime.value = 0.34;
    const fb = ctx.createGain(); fb.gain.value = 0.3;
    const damp = ctx.createBiquadFilter(); damp.type = "lowpass"; damp.frequency.value = 1400;
    padFilter.connect(pad);
    padFilter.connect(delay);
    delay.connect(damp).connect(fb).connect(delay);
    delay.connect(pad);

    [73.42, 110, 146.83, 174.61, 220].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? "triangle" : "sine";
      o.frequency.value = f; o.detune.value = (i - 2) * 3.5;
      const g = ctx.createGain(); g.gain.value = 0.045 - i * 0.005;
      o.connect(g).connect(padFilter);
      o.start();
    });

    const now = ctx.currentTime;
    this._next = { cricket: now + 0.5, lap: now + 1.2, fly: now + 0.4 };
    this.ready = true;
  }

  _lfo(freq, depth, param, offset) {
    const o = this.ctx.createOscillator();
    o.type = "sine"; o.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = depth;
    param.value = offset;
    o.connect(g).connect(param);
    o.start();
  }

  _schedule() {
    clearTimeout(this._timer);
    const tick = () => {
      if (!this.enabled || !this.ctx) return;
      const horizon = this.ctx.currentTime + 1.2;
      while (this._next.cricket < horizon) {
        this._cricket(this._next.cricket);
        this._next.cricket += 1.5 + Math.random() * 3.2;
      }
      while (this._next.lap < horizon) {
        this._lap(this._next.lap);
        this._next.lap += 2.2 + Math.random() * 3.6;
      }
      while (this._next.fly < horizon) {
        this._blip(this._next.fly);
        this._next.fly += 0.7 + Math.random() * 2;
      }
      this._timer = setTimeout(tick, 200);
    };
    tick();
  }

  _env(t, peak, attack, release) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
    return g;
  }

  _cricket(time) {
    const ctx = this.ctx;
    const pan = ctx.createStereoPanner();
    pan.pan.value = (Math.random() - 0.5) * 1.6;
    pan.connect(this._nodes.crickets);
    const base = 3400 + Math.random() * 1400;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const t = time + i * (0.062 + Math.random() * 0.025);
      const s = ctx.createBufferSource(); s.buffer = this.white;
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = base; bp.Q.value = 16;
      const g = this._env(t, 0.13, 0.008, 0.05);
      s.connect(bp).connect(g).connect(pan);
      s.start(t); s.stop(t + 0.085);
    }
  }

  _lap(time) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.pink;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass";
    lp.frequency.setValueAtTime(430, time);
    lp.frequency.exponentialRampToValueAtTime(180, time + 0.7);
    const g = this._env(time, 0.26, 0.12, 0.7);
    const p = ctx.createStereoPanner(); p.pan.value = (Math.random() - 0.5) * 0.8;
    s.connect(lp).connect(g).connect(p).connect(this._nodes.water);
    s.start(time); s.stop(time + 0.95);
  }

  _blip(time) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = "sine";
    const f = 1500 + Math.random() * 1600;
    o.frequency.setValueAtTime(f, time);
    o.frequency.exponentialRampToValueAtTime(f * 1.16, time + 0.09);
    const g = this._env(time, 0.05, 0.01, 0.13);
    const p = ctx.createStereoPanner(); p.pan.value = (Math.random() - 0.5) * 1.6;
    o.connect(g).connect(p).connect(this._nodes.pad);
    o.start(time); o.stop(time + 0.2);
  }

  _chime(freqs, release, peak, type = "sine") {
    if (!this.enabled || !this.ready) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.015;
    freqs.forEach((f, i) => {
      const t = t0 + i * 0.065;
      const o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.99, t + release);
      const g = this._env(t, peak * (1 - i * 0.1), 0.012, release);
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3600;
      o.connect(g).connect(lp).connect(this._nodes.master);
      o.start(t); o.stop(t + release + 0.06);
    });
  }

  // ---------- game SFX ----------

  catchNote(step) {
    const f = PENTA[Math.max(0, Math.min(PENTA.length - 1, step))];
    this._chime([f, f * 2], 0.3, 0.07);
  }

  bloom() { this._chime([659.25, 987.77, 1318.51, 1975.53], 1.05, 0.07); }
  wisp() { this._chime([880, 1318.51, 1760], 0.55, 0.055, "triangle"); }
  ember() { this._chime([440, 660], 0.5, 0.06, "triangle"); }
  phase() { this._chime([392, 523.25, 659.25, 783.99, 1046.5], 1.4, 0.08); }
  over() { this._chime([392, 349.23, 293.66, 220], 1.9, 0.075); }
  ui() { this._chime([784, 1176], 0.08, 0.035); }

  dash() {
    if (!this.enabled || !this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.01;
    const s = ctx.createBufferSource(); s.buffer = this.white;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(320, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.22);
    const g = this._env(t, 0.13, 0.01, 0.25);
    s.connect(bp).connect(g).connect(this._nodes.master);
    s.start(t); s.stop(t + 0.32);
  }

  shieldBreak() { this._chime([1318.51, 880, 587.33], 0.5, 0.07, "triangle"); }

  damage() {
    if (!this.enabled || !this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.01;

    const s = ctx.createBufferSource(); s.buffer = this.white;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 2.2;
    bp.frequency.setValueAtTime(760, t);
    bp.frequency.exponentialRampToValueAtTime(140, t + 0.4);
    const ng = this._env(t, 0.3, 0.012, 0.44);
    s.connect(bp).connect(ng).connect(this._nodes.master);
    s.start(t); s.stop(t + 0.5);

    const o = ctx.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(62, t + 0.42);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900;
    const og = this._env(t, 0.18, 0.02, 0.48);
    o.connect(lp).connect(og).connect(this._nodes.master);
    o.start(t); o.stop(t + 0.55);
  }
}

export const audio = new Nightscape();
