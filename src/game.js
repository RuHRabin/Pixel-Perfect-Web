/* ============================================================
   Lantern Keeper — canvas engine
   by RuHRabin
   ============================================================ */

export const DIFFICULTY = {
  calm:     { label: "Calm",     spawn: 1.18, fall: 0.86, moth: 0.08, drain: 0.7, regen: 1.4 },
  nocturne: { label: "Nocturne", spawn: 1.0,  fall: 1.0,  moth: 0.13, drain: 1.0, regen: 1.0 },
  tempest:  { label: "Tempest",  spawn: 0.78, fall: 1.22, moth: 0.2,  drain: 1.35, regen: 0.7 },
};

const KIND = {
  FLY: "fly",
  BLOOM: "bloom",
  MOTH: "moth",
  EMBER: "ember",
  WISP: "wisp",
};

function sprite(inner, mid, outer) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.22, mid);
  grad.addColorStop(0.5, outer);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class LanternGame {
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.hooks = hooks;
    this.difficulty = "nocturne";

    this.state = "idle";
    this.raf = 0;
    this.last = 0;
    this.acc = 0;
    this.time = 0;

    this.w = 0; this.h = 0; this.s = 1;
    this.bg = null;

    this.px = 0; this.targetX = 0; this.keyDir = 0;
    this.walk = 0; this.scarf = [];
    this.facing = 1;

    this.entities = [];
    this.particles = [];
    this.ripples = [];
    this.stars = [];
    this.motes = [];

    this.sprites = {
      gold: sprite("#fffbe8", "#ffe483", "rgba(255,176,48,0.45)"),
      cream: sprite("#ffffff", "#e6f0ff", "rgba(160,200,255,0.42)"),
      violet: sprite("#e6d8ff", "#9f7bff", "rgba(90,50,180,0.38)"),
      ember: sprite("#fff1d6", "#ffb066", "rgba(255,120,40,0.42)"),
      cyan: sprite("#eafcff", "#8fe6ff", "rgba(60,180,255,0.42)"),
    };

    this.reset(true);
    this.resize();
  }

  // ------------------------------------------------ setup

  setBackground(img) { this.bg = img; }
  setDifficulty(key) { if (DIFFICULTY[key]) this.difficulty = key; }
  get cfg() { return DIFFICULTY[this.difficulty]; }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    this.w = Math.max(320, r.width);
    this.h = Math.max(420, r.height);
    this.canvas.width = Math.floor(this.w * dpr);
    this.canvas.height = Math.floor(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.s = clamp(this.h / 760, 0.62, 1.4);
    if (!this.px) { this.px = this.w / 2; this.targetX = this.px; }
    this._buildSky();
  }

  _buildSky() {
    const n = clamp(Math.round((this.w * this.h) / 26000), 26, 90);
    this.stars = Array.from({ length: n }, () => ({
      x: Math.random() * this.w,
      y: Math.random() * this.h * 0.62,
      r: Math.random() < 0.85 ? 0.6 + Math.random() : 1.4 + Math.random(),
      tw: 2 + Math.random() * 4,
      ph: Math.random() * 6.28,
    }));
    const m = clamp(Math.round((this.w * this.h) / 48000), 10, 34);
    this.motes = Array.from({ length: m }, () => ({
      x: Math.random() * this.w,
      y: Math.random() * this.h * 0.9,
      r: 1 + Math.random() * 2.2,
      sp: 5 + Math.random() * 14,
      ph: Math.random() * 100,
    }));
  }

  get waterY() { return this.h * 0.8; }

  get lantern() {
    const bob = Math.sin(this.walk * 2) * 2 * this.s;
    return { x: this.px + 30 * this.s * this.facing, y: this.waterY - 66 * this.s + bob };
  }

  get radius() {
    let r = 76 * this.s;
    if (this.moonrise > 0) r *= 1.85;
    if (this.dashT > 0) r *= 1.5;
    return r * (0.7 + 0.3 * (this.light / 100));
  }

  // ------------------------------------------------ lifecycle

  reset(silent) {
    this.score = 0;
    this.light = 100;
    this.combo = 0;
    this.bestCombo = 0;
    this.comboT = 0;
    this.phase = 1;
    this.caught = 0;
    this.totalCaught = 0;
    this.target = 10;
    this.moonrise = 0;
    this.shields = 0;
    this.dashCd = 0;
    this.dashT = 0;
    this.hurtCd = 0;
    this.shake = 0;
    this.flash = 0;
    this.entities = [];
    this.particles = [];
    this.ripples = [];
    this.spawnT = 0.6;
    if (!silent) this._emit();
  }

  start() {
    this.reset(true);
    this.state = "playing";
    this._emit();
    this._loop();
  }

  pause() {
    if (this.state !== "playing") return;
    this.state = "paused";
    this._emit();
  }

  resume() {
    if (this.state !== "paused") return;
    this.state = "playing";
    this.last = performance.now();
    this._emit();
    this._loop();
  }

  togglePause() {
    if (this.state === "playing") this.pause();
    else if (this.state === "paused") this.resume();
  }

  destroy() { cancelAnimationFrame(this.raf); this.raf = 0; }

  _gameOver() {
    this.state = "over";
    this.hooks.onOver?.({
      score: Math.round(this.score),
      phase: this.phase,
      chain: this.bestCombo,
      caught: this.totalCaught,
      difficulty: this.difficulty,
    });
    this._emit();
  }

  // ------------------------------------------------ input

  setPointer(clientX) {
    const r = this.canvas.getBoundingClientRect();
    this.targetX = clientX - r.left;
  }
  setKeyDir(d) { this.keyDir = d; }

  dash() {
    if (this.state !== "playing" || this.dashCd > 0) return;
    this.dashCd = 2.1;
    this.dashT = 0.36;
    const dir = this.keyDir !== 0 ? this.keyDir : this.facing;
    this.targetX = clamp(this.targetX + dir * 190 * this.s, 40 * this.s, this.w - 40 * this.s);
    this.hooks.onDash?.();
    const l = this.lantern;
    for (let i = 0; i < 16; i++) this._spark(l.x, l.y, "cyan", 1.3);
  }

  // ------------------------------------------------ loop

  _loop() {
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (this.state === "playing") {
        this.acc += dt;
        let guard = 0;
        while (this.acc >= 1 / 120 && guard < 10) {
          this._update(1 / 120);
          this.acc -= 1 / 120;
          guard++;
        }
      } else {
        this._idle(dt);
      }
      this._draw();
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  _idle(dt) {
    this.time += dt;
    this._player(dt * 0.5);
    this._ambient(dt);
    this._decayFx(dt);
  }

  _decayFx(dt) {
    for (const p of this.particles) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += (p.text ? -16 : 26) * dt; p.vx *= 0.99;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const r of this.ripples) { r.life -= dt; r.r += r.sp * dt; }
    this.ripples = this.ripples.filter((r) => r.life > 0);
  }

  _update(dt) {
    const slow = this.moonrise > 0 ? 0.76 : 1;
    const d = dt * slow;
    this.time += dt;
    const cfg = this.cfg;

    this._player(dt);
    this._ambient(dt);
    this._decayFx(dt);

    if (this.moonrise > 0) this.moonrise = Math.max(0, this.moonrise - dt);
    if (this.dashCd > 0) this.dashCd = Math.max(0, this.dashCd - dt);
    if (this.dashT > 0) this.dashT = Math.max(0, this.dashT - dt);
    if (this.hurtCd > 0) this.hurtCd -= dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.4);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2);

    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }

    if (this.hurtCd <= 0) this.light = Math.min(100, this.light + 0.9 * cfg.regen * dt);

    // spawning
    this.spawnT -= d;
    if (this.spawnT <= 0) {
      this._spawn();
      const base = Math.max(0.26, (1.05 - this.phase * 0.055) * cfg.spawn);
      this.spawnT = base * (0.7 + Math.random() * 0.62);
    }

    const l = this.lantern;
    const R = this.radius;

    for (const e of this.entities) {
      e.t += d;
      const dx = l.x - e.x, dy = l.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;

      if (e.kind === KIND.MOTH) {
        e.vx += Math.sign(l.x - e.x) * 11 * this.s * d;
        e.vx = clamp(e.vx, -52 * this.s, 52 * this.s);
      } else {
        e.vx += Math.sin(e.t * 1.6 + e.seed) * 12 * this.s * d;
        e.vx *= 0.995;
        const pull = R * (this.moonrise > 0 ? 2.7 : this.dashT > 0 ? 2.4 : 1.85);
        if (dist < pull) {
          const f = (1 - dist / pull) * 340 * this.s;
          e.vx += (dx / dist) * f * d;
          e.vy += (dy / dist) * f * d;
        }
      }

      e.x += e.vx * d;
      e.y += e.vy * d;

      if (e.kind === KIND.MOTH) {
        if (dist < R * 0.5 && this.hurtCd <= 0) this._hit(e);
        else if (e.y > this.waterY + 10) { e.dead = true; this._ripple(e.x, "violet"); }
      } else if (dist < R * 0.46) {
        this._collect(e);
      } else if (e.y > this.waterY + 4) {
        this._miss(e);
      }

      if (e.x < -70 || e.x > this.w + 70) e.dead = true;
    }
    this.entities = this.entities.filter((e) => !e.dead);

    if (this.light <= 0) { this.light = 0; this._gameOver(); return; }

    this._emitThrottle();
  }

  _player(dt) {
    const margin = 44 * this.s;
    if (this.keyDir !== 0) this.targetX += this.keyDir * 640 * this.s * dt;
    this.targetX = clamp(this.targetX, margin, this.w - margin);

    const prev = this.px;
    const ease = this.dashT > 0 ? 16 : 7.5;
    this.px += (this.targetX - this.px) * Math.min(1, dt * ease);
    const moved = this.px - prev;
    if (Math.abs(moved) > 0.4) this.facing = moved > 0 ? 1 : -1;
    this.walk += Math.abs(moved) * 0.06 + dt * 0.6;

    if (this.dashT > 0 && Math.abs(moved) > 0.5) {
      this._spark(this.px, this.waterY - 54 * this.s, "cyan", 0.5);
    }

    const anchor = { x: this.px - 6 * this.s * this.facing, y: this.waterY - 92 * this.s };
    if (this.scarf.length === 0) this.scarf = Array.from({ length: 13 }, () => ({ ...anchor }));
    this.scarf[0] = anchor;
    const wind = 46 * this.s;
    for (let i = 1; i < this.scarf.length; i++) {
      const p = this.scarf[i - 1], n = this.scarf[i];
      const w = wind + Math.sin(this.time * 2 + i * 0.5) * 16 * this.s;
      const tx = p.x + w * 0.1 * this.facing - moved * 1.6;
      const ty = p.y + Math.sin(this.time * 2.4 + i * 0.7) * 2.4 * this.s;
      n.x += (tx - n.x) * Math.min(1, dt * (16 - i * 0.6));
      n.y += (ty - n.y) * Math.min(1, dt * (14 - i * 0.5));
    }
  }

  _ambient(dt) {
    for (const m of this.motes) {
      m.y -= m.sp * dt * 0.25;
      m.x += Math.sin(this.time * 0.4 + m.ph) * 4 * dt;
      if (m.y < -10) { m.y = this.h * 0.92; m.x = Math.random() * this.w; }
    }
  }

  // ------------------------------------------------ spawn & events

  _spawn() {
    const cfg = this.cfg;
    const roll = Math.random();
    const mothC = Math.min(0.4, cfg.moth + this.phase * 0.022);
    let kind = KIND.FLY;
    if (roll < 0.045) kind = KIND.BLOOM;
    else if (roll < 0.045 + mothC) kind = KIND.MOTH;
    else if (roll < 0.075 + mothC) kind = KIND.EMBER;
    else if (roll < 0.1 + mothC && this.shields < 2) kind = KIND.WISP;

    const margin = 42 * this.s;
    const speed = (30 + this.phase * 5 + Math.random() * 22) * this.s * cfg.fall;

    this.entities.push({
      kind,
      x: margin + Math.random() * (this.w - margin * 2),
      y: -30,
      vx: (Math.random() - 0.5) * 26 * this.s,
      vy: kind === KIND.MOTH ? speed * 0.85 : speed,
      r: kind === KIND.BLOOM ? 8 * this.s : kind === KIND.MOTH ? 15 * this.s : 6.6 * this.s,
      seed: Math.random() * 10,
      t: 0,
      dead: false,
    });
  }

  _collect(e) {
    e.dead = true;
    const mult = this.multiplier;
    const moon = this.moonrise > 0 ? 2 : 1;
    let gain = 0;

    if (e.kind === KIND.BLOOM) {
      gain = 60 * mult * moon;
      this.moonrise = 6.5;
      this.light = Math.min(100, this.light + 12);
      this.hooks.onBloom?.();
      this._spark(e.x, e.y, "cream", 22);
    } else if (e.kind === KIND.EMBER) {
      gain = 15 * mult * moon;
      this.light = Math.min(100, this.light + 22);
      this.hooks.onEmber?.();
      this._spark(e.x, e.y, "ember", 16);
    } else if (e.kind === KIND.WISP) {
      gain = 20 * mult * moon;
      this.shields = Math.min(2, this.shields + 1);
      this.hooks.onWisp?.();
      this._spark(e.x, e.y, "cyan", 16);
    } else {
      gain = 10 * mult * moon;
      this.light = Math.min(100, this.light + 1.8);
      this._spark(e.x, e.y, "gold", 10);
    }

    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.comboT = 2.8;
    this.score += gain;
    this.caught++;
    this.totalCaught++;

    this._float(e.x, e.y - 6, `+${Math.round(gain)}`, e.kind === KIND.FLY ? "gold" : "cream");
    if (e.kind === KIND.FLY) this.hooks.onCatch?.(this.combo - 1);

    if (this.caught >= this.target) {
      this.phase++;
      this.caught = 0;
      this.target = 10 + this.phase * 3;
      this.light = Math.min(100, this.light + 14);
      this.flash = 0.85;
      this.hooks.onPhase?.(this.phase);
    }
    this._emit();
  }

  _miss(e) {
    e.dead = true;
    this.combo = 0;
    const cost = e.kind === KIND.FLY ? 4 : 1.5;
    this.light = Math.max(0, this.light - cost * this.cfg.drain);
    this._ripple(e.x, e.kind === KIND.BLOOM ? "cream" : "gold");
    this._spark(e.x, this.waterY, "gold", 5);
    this._emit();
  }

  _hit(e) {
    e.dead = true;
    this.combo = 0;

    if (this.shields > 0) {
      this.shields--;
      this.hurtCd = 0.7;
      this.flash = 0.4;
      this.hooks.onShield?.();
      this._spark(e.x, e.y, "cyan", 20);
      this._emit();
      return;
    }

    this.hurtCd = 1.15;
    this.light = Math.max(0, this.light - 17 * this.cfg.drain);
    this.shake = 1;
    this.flash = 0.6;
    this.hooks.onDamage?.();
    this._spark(e.x, e.y, "violet", 20);
    this._emit();
  }

  get multiplier() { return Math.min(6, 1 + Math.floor(this.combo / 3)); }

  _spark(x, y, hue, n) {
    const count = Math.round(n);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * 6.283;
      const sp = (30 + Math.random() * 150) * this.s;
      this.particles.push({
        x, y, hue,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.4 + Math.random() * 0.6, max: 1,
        size: (1.4 + Math.random() * 2.6) * this.s,
      });
    }
  }

  _float(x, y, text, hue) {
    this.particles.push({ x, y, text, hue, vx: 0, vy: -28, life: 0.95, max: 0.95, size: 14 });
  }

  _ripple(x, hue) {
    this.ripples.push({ x, y: this.waterY, r: 2 * this.s, sp: 70 * this.s, life: 0.9, hue });
  }

  // ------------------------------------------------ state out

  _emitThrottle() {
    if (this.time - (this._lastEmit || 0) < 0.08) return;
    this._lastEmit = this.time;
    this._emit();
  }

  _emit() {
    this.hooks.onState?.({
      state: this.state,
      score: Math.round(this.score),
      light: this.light,
      combo: this.combo,
      multiplier: this.multiplier,
      phase: this.phase,
      caught: this.caught,
      target: this.target,
      moonrise: this.moonrise,
      shields: this.shields,
      dash: 1 - this.dashCd / 2.1,
      chain: this.bestCombo,
      totalCaught: this.totalCaught,
    });
  }

  // ------------------------------------------------ render

  _draw() {
    const c = this.ctx;
    c.save();
    if (this.shake > 0) {
      const m = this.shake * 9 * this.s;
      c.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    this._bg(c);
    this._sky(c);
    this._water(c);
    this._motes(c);
    this._reflect(c);
    this._ripplesDraw(c);
    this._entities(c);
    this._lanternLight(c);
    this._wanderer(c, this.px, this.waterY, 1);
    this._particles(c);
    this._vignette(c);
    c.restore();
  }

  _bg(c) {
    c.fillStyle = "#070514";
    c.fillRect(0, 0, this.w, this.h);
    const img = this.bg;
    if (img && img.complete && img.naturalWidth) {
      const drift = (this.px / this.w - 0.5) * 30;
      const k = Math.max(this.w / img.naturalWidth, this.h / img.naturalHeight) * 1.08;
      const dw = img.naturalWidth * k, dh = img.naturalHeight * k;
      c.globalAlpha = 0.9;
      c.drawImage(img, (this.w - dw) / 2 - drift, (this.h - dh) * 0.4, dw, dh);
      c.globalAlpha = 1;
    }
    const g = c.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, "rgba(7,5,20,0.5)");
    g.addColorStop(0.55, "rgba(7,5,20,0.28)");
    g.addColorStop(1, "rgba(7,5,20,0.86)");
    c.fillStyle = g;
    c.fillRect(0, 0, this.w, this.h);

    if (this.moonrise > 0) {
      c.globalCompositeOperation = "lighter";
      c.fillStyle = `rgba(130,120,210,${0.05 + Math.sin(this.time * 6) * 0.015})`;
      c.fillRect(0, 0, this.w, this.h);
      c.globalCompositeOperation = "source-over";
    }
    if (this.flash > 0) {
      c.globalCompositeOperation = "lighter";
      c.fillStyle = `rgba(255,190,70,${this.flash * 0.1})`;
      c.fillRect(0, 0, this.w, this.h);
      c.globalCompositeOperation = "source-over";
    }
  }

  _sky(c) {
    c.globalCompositeOperation = "lighter";
    for (const s of this.stars) {
      const tw = 0.25 + Math.abs(Math.sin(this.time / s.tw * 2 + s.ph)) * 0.75;
      c.globalAlpha = tw * 0.9;
      c.fillStyle = "#fff";
      c.beginPath();
      c.arc(s.x, s.y, s.r, 0, 6.283);
      c.fill();
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
  }

  _water(c) {
    const y = this.waterY;
    const g = c.createLinearGradient(0, y, 0, this.h);
    g.addColorStop(0, "rgba(28,22,72,0.5)");
    g.addColorStop(1, "rgba(9,7,26,0.92)");
    c.fillStyle = g;
    c.fillRect(0, y, this.w, this.h - y);

    c.globalCompositeOperation = "lighter";
    for (let i = 0; i < 10; i++) {
      const ly = y + 8 + i * ((this.h - y) / 10);
      const wob = Math.sin(this.time * 0.8 + i * 0.9) * 18;
      c.strokeStyle = `rgba(248,233,161,${0.05 - i * 0.0038})`;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(this.w * 0.08 + wob, ly);
      c.lineTo(this.w * 0.92 + wob, ly);
      c.stroke();
    }
    c.globalCompositeOperation = "source-over";

    c.strokeStyle = "rgba(183,176,217,0.2)";
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, y); c.lineTo(this.w, y); c.stroke();
  }

  _motes(c) {
    c.globalCompositeOperation = "lighter";
    for (const m of this.motes) {
      const tw = 0.25 + Math.abs(Math.sin(this.time * 1.4 + m.ph)) * 0.6;
      c.globalAlpha = tw * 0.45;
      const sz = m.r * 7;
      c.drawImage(this.sprites.gold, m.x - sz / 2, m.y - sz / 2, sz, sz);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
  }

  _reflect(c) {
    const y = this.waterY;
    c.save();
    c.beginPath(); c.rect(0, y, this.w, this.h - y); c.clip();

    c.globalAlpha = 0.28;
    c.save();
    c.translate(0, y * 2);
    c.scale(1, -1);
    this._wanderer(c, this.px + Math.sin(this.time * 1.4) * 2, y, 0.8);
    c.restore();

    c.globalCompositeOperation = "lighter";
    for (const e of this.entities) {
      if (e.kind === KIND.MOTH || e.y > y) continue;
      const ry = y + (y - e.y) * 0.45;
      if (ry > this.h) continue;
      const sp = this._spriteFor(e.kind);
      const sz = e.r * 7;
      const wob = Math.sin(this.time * 2 + e.seed) * 3;
      c.globalAlpha = 0.15;
      c.drawImage(sp, e.x - sz / 2 + wob, ry - sz / 2, sz, sz * 1.6);
    }

    // lantern glow on the water
    const l = this.lantern;
    c.globalAlpha = 0.24;
    const gl = this.radius * 1.2;
    c.drawImage(this.sprites.gold, l.x - gl / 2, y - gl * 0.15, gl, gl * 0.9);

    c.restore();
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
  }

  _ripplesDraw(c) {
    c.globalCompositeOperation = "lighter";
    for (const r of this.ripples) {
      const k = r.life / 0.9;
      c.globalAlpha = k * 0.5;
      c.strokeStyle =
        r.hue === "violet" ? "rgba(159,123,255,0.9)" :
        r.hue === "cream" ? "rgba(255,255,255,0.9)" : "rgba(255,200,69,0.9)";
      c.lineWidth = 1.4;
      c.beginPath();
      c.ellipse(r.x, r.y, r.r, r.r * 0.32, 0, 0, 6.283);
      c.stroke();
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
  }

  _spriteFor(kind) {
    if (kind === KIND.BLOOM) return this.sprites.cream;
    if (kind === KIND.EMBER) return this.sprites.ember;
    if (kind === KIND.WISP) return this.sprites.cyan;
    return this.sprites.gold;
  }

  _entities(c) {
    for (const e of this.entities) {
      if (e.kind === KIND.MOTH) { this._moth(c, e); continue; }

      const sp = this._spriteFor(e.kind);
      const rate = e.kind === KIND.BLOOM ? 3 : e.kind === KIND.WISP ? 6 : 5;
      const pulse = 0.75 + Math.abs(Math.sin(e.t * rate + e.seed)) * 0.45;
      const sz = e.r * 9 * pulse;

      c.globalCompositeOperation = "lighter";
      c.drawImage(sp, e.x - sz / 2, e.y - sz / 2, sz, sz);

      if (e.kind === KIND.WISP) {
        c.strokeStyle = "rgba(180,240,255,0.55)";
        c.lineWidth = 1;
        c.beginPath();
        c.arc(e.x, e.y, e.r * 1.9 + Math.sin(e.t * 4) * 2, 0, 6.283);
        c.stroke();
      }
      c.globalCompositeOperation = "source-over";

      c.fillStyle =
        e.kind === KIND.BLOOM ? "#fff" :
        e.kind === KIND.EMBER ? "#ffd9a8" :
        e.kind === KIND.WISP ? "#dffaff" : "#fff6d2";
      c.beginPath();
      c.arc(e.x, e.y, e.r * 0.4, 0, 6.283);
      c.fill();
    }
  }

  _moth(c, e) {
    const flap = Math.sin(e.t * 12 + e.seed) * 0.5 + 0.5;
    c.save();
    c.translate(e.x, e.y);

    c.globalCompositeOperation = "lighter";
    c.globalAlpha = 0.5;
    const gl = e.r * 5;
    c.drawImage(this.sprites.violet, -gl / 2, -gl / 2, gl, gl);
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;

    c.fillStyle = "#0a0718";
    c.strokeStyle = "rgba(160,120,255,0.6)";
    c.lineWidth = 1.1;
    const w = e.r * (0.9 + flap * 0.5);
    c.beginPath();
    c.moveTo(0, 0);
    c.quadraticCurveTo(-w * 1.5, -w * 1.1, -w * 1.7, w * 0.28);
    c.quadraticCurveTo(-w * 1.1, w * 1.05, 0, e.r * 0.5);
    c.quadraticCurveTo(w * 1.1, w * 1.05, w * 1.7, w * 0.28);
    c.quadraticCurveTo(w * 1.5, -w * 1.1, 0, 0);
    c.fill(); c.stroke();

    c.fillStyle = "#07050f";
    c.beginPath();
    c.ellipse(0, e.r * 0.15, e.r * 0.26, e.r * 0.7, 0, 0, 6.283);
    c.fill();
    c.restore();
  }

  _lanternLight(c) {
    const { x, y } = this.lantern;
    const R = this.radius;
    c.globalCompositeOperation = "lighter";

    const pulse = 1 + Math.sin(this.time * 2.4) * 0.03;
    const dim = this.light < 30 ? 0.6 + Math.sin(this.time * 9) * 0.12 : 1;
    const strength = (this.moonrise > 0 ? 0.34 : 0.24) * dim;
    const g = c.createRadialGradient(x, y, 0, x, y, R * pulse);
    g.addColorStop(0, `rgba(255,236,170,${strength})`);
    g.addColorStop(0.35, `rgba(255,200,69,${strength * 0.5})`);
    g.addColorStop(1, "rgba(255,170,40,0)");
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, R * pulse, 0, 6.283); c.fill();

    const core = 26 * this.s;
    c.drawImage(this.sprites.gold, x - core / 2, y - core / 2, core, core);
    c.globalCompositeOperation = "source-over";

    c.strokeStyle = `rgba(255,214,110,${this.dashT > 0 ? 0.5 : this.moonrise > 0 ? 0.34 : 0.15})`;
    c.lineWidth = 1;
    c.setLineDash([4, 8]);
    c.beginPath(); c.arc(x, y, R * 0.46, 0, 6.283); c.stroke();
    c.setLineDash([]);

    // shield rings
    for (let i = 0; i < this.shields; i++) {
      c.strokeStyle = `rgba(150,230,255,${0.5 - i * 0.14})`;
      c.lineWidth = 1.6;
      c.beginPath();
      c.arc(x, y, R * (0.56 + i * 0.1) + Math.sin(this.time * 3 + i) * 2, 0, 6.283);
      c.stroke();
    }
  }

  _wanderer(c, x, gy, alpha) {
    const s = this.s;
    const f = this.facing;
    const swing = Math.sin(this.walk) * 6 * s;
    const hurt = this.hurtCd > 0 && Math.floor(this.time * 18) % 2 === 0;

    c.save();
    c.globalAlpha = alpha * (hurt ? 0.45 : 1);
    c.fillStyle = "#06040f";
    c.strokeStyle = "#06040f";
    c.lineCap = "round";

    c.lineWidth = 7 * s;
    c.beginPath();
    c.moveTo(x - 2 * s, gy - 52 * s); c.lineTo(x - 6 * s + swing, gy);
    c.moveTo(x + 2 * s, gy - 52 * s); c.lineTo(x + 7 * s - swing, gy);
    c.stroke();

    c.beginPath();
    c.moveTo(x - 15 * s, gy - 96 * s);
    c.quadraticCurveTo(x - 23 * s, gy - 70 * s, x - 17 * s, gy - 40 * s);
    c.lineTo(x + 17 * s, gy - 40 * s);
    c.quadraticCurveTo(x + 23 * s, gy - 70 * s, x + 15 * s, gy - 96 * s);
    c.closePath(); c.fill();

    c.lineWidth = 5.5 * s;
    c.beginPath();
    c.moveTo(x + 12 * s * f, gy - 90 * s);
    c.quadraticCurveTo(x + 26 * s * f, gy - 82 * s, x + 30 * s * f, gy - 66 * s);
    c.stroke();

    c.beginPath();
    c.arc(x, gy - 110 * s, 11 * s, 0, 6.283);
    c.fill();

    c.beginPath();
    c.moveTo(x - 11 * s, gy - 114 * s);
    c.lineTo(x - 15 * s, gy - 126 * s);
    c.lineTo(x - 5 * s, gy - 119 * s);
    c.lineTo(x - 2 * s, gy - 129 * s);
    c.lineTo(x + 4 * s, gy - 118 * s);
    c.lineTo(x + 11 * s, gy - 125 * s);
    c.lineTo(x + 11 * s, gy - 112 * s);
    c.closePath(); c.fill();

    if (this.scarf.length > 2) {
      c.strokeStyle = "rgba(244,238,218,0.92)";
      c.lineWidth = 6.5 * s;
      c.beginPath();
      c.moveTo(this.scarf[0].x, this.scarf[0].y);
      for (let i = 1; i < this.scarf.length - 1; i++) {
        const a = this.scarf[i], b = this.scarf[i + 1];
        c.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
      c.stroke();
      c.strokeStyle = "rgba(255,255,255,0.4)";
      c.lineWidth = 2 * s;
      c.stroke();
    }

    c.strokeStyle = "rgba(248,233,161,0.42)";
    c.lineWidth = 1.6 * s;
    c.beginPath();
    c.moveTo(x - 15 * s, gy - 94 * s);
    c.quadraticCurveTo(x - 23 * s, gy - 70 * s, x - 17 * s, gy - 42 * s);
    c.stroke();

    c.restore();
  }

  _particles(c) {
    for (const p of this.particles) {
      const k = Math.max(0, p.life / (p.max || 1));
      if (p.text) {
        c.globalAlpha = Math.min(1, k * 1.5);
        c.fillStyle = p.hue === "cream" ? "#fff" : "#ffd873";
        c.font = `${p.size * this.s}px "Cormorant Garamond", serif`;
        c.textAlign = "center";
        c.fillText(p.text, p.x, p.y);
        c.globalAlpha = 1;
        continue;
      }
      const sp = this.sprites[p.hue] || this.sprites.gold;
      const sz = p.size * 6 * k;
      c.globalCompositeOperation = "lighter";
      c.globalAlpha = k;
      c.drawImage(sp, p.x - sz / 2, p.y - sz / 2, sz, sz);
      c.globalCompositeOperation = "source-over";
      c.globalAlpha = 1;
    }
  }

  _vignette(c) {
    const g = c.createRadialGradient(
      this.w / 2, this.h * 0.5, Math.min(this.w, this.h) * 0.3,
      this.w / 2, this.h * 0.5, Math.max(this.w, this.h) * 0.78,
    );
    g.addColorStop(0, "rgba(7,5,20,0)");
    g.addColorStop(1, "rgba(7,5,20,0.78)");
    c.fillStyle = g;
    c.fillRect(0, 0, this.w, this.h);

    if (this.light < 35 && this.state === "playing") {
      const dark = (1 - this.light / 35) * 0.5;
      c.fillStyle = `rgba(10,4,26,${dark * (0.7 + Math.sin(this.time * 4) * 0.12)})`;
      c.fillRect(0, 0, this.w, this.h);
    }
  }
}
