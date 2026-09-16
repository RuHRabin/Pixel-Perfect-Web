/* ============================================================
   Lantern Keeper — app wiring
   by RuHRabin · github.com/RuHRabin
   ============================================================ */

import "./style.css";
import { LanternGame } from "./game.js";
import { audio } from "./audio.js";
import bgWide from "./assets/hero-desktop.jpg";
import bgTall from "./assets/hero-mobile.jpg";

const $ = (id) => document.getElementById(id);
const RUNS_KEY = "lk-runs-v2";
const BEST_KEY = "lk-best-v2";
const DIFF_KEY = "lk-diff-v2";
const SOUND_KEY = "lk-sound-v2";

/* ---------------------------------------------- storage */

const store = {
  runs() {
    try { return JSON.parse(localStorage.getItem(RUNS_KEY)) || []; } catch { return []; }
  },
  best() {
    try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
  },
  save(run) {
    try {
      const runs = store.runs();
      runs.push(run);
      runs.sort((a, b) => b.score - a.score);
      localStorage.setItem(RUNS_KEY, JSON.stringify(runs.slice(0, 6)));
      if (run.score > store.best()) localStorage.setItem(BEST_KEY, String(run.score));
    } catch { /* storage blocked */ }
  },
  clear() {
    try { localStorage.removeItem(RUNS_KEY); localStorage.removeItem(BEST_KEY); } catch { /* noop */ }
  },
};

/* ---------------------------------------------- static content */

const STEPS = [
  { n: "01", jp: "歩", t: "Walk the shallows",
    d: "Move with your pointer, or hold ← → / A · D. The wanderer wades the waterline with the lantern swinging at his side." },
  { n: "02", jp: "集", t: "Gather falling light",
    d: "Fireflies drift down from the ridge. Bring your glow beneath one and it is drawn in. Catch without missing to raise your multiplier." },
  { n: "03", jp: "閃", t: "Dash through the dark",
    d: "Tap Space to dash — a burst of speed that widens your glow and yanks nearby light straight into the lantern." },
  { n: "04", jp: "護", t: "Guard the flame",
    d: "Shadow moths hunt your fire. A wisp shield eats one hit; without it you lose light. At zero, the night ends." },
];

const BEASTS = [
  { jp: "蛍", name: "Common firefly", worth: "+10 × chain", core: "#ffe483", glow: "rgba(255,200,69,0.75)",
    d: "The steady gold of the reed beds. Falls slow, drifts sideways, and leans toward any light kinder than its own." },
  { jp: "月華", name: "Moonbloom", worth: "+60 · moonrise", core: "#ffffff", glow: "rgba(200,225,255,0.8)",
    d: "Shaken loose from the moon itself. Widens your glow, slows the night, and doubles all light for six seconds." },
  { jp: "熾火", name: "Emberdrop", worth: "+15 · +22 lantern", core: "#ffb066", glow: "rgba(255,140,60,0.75)",
    d: "A warm coal falling from nowhere. Worth little in score, but it pours fuel straight back into a dying lantern." },
  { jp: "霊火", name: "Pale wisp", worth: "+20 · shield", core: "#8fe6ff", glow: "rgba(110,220,255,0.75)",
    d: "A cold blue spark that circles itself. Catch one and it rings your lantern, absorbing a single moth strike." },
  { jp: "闇蛾", name: "Shadow moth", worth: "−17 lantern", core: "#2a1a52", glow: "rgba(140,100,255,0.7)",
    d: "Tattered, silent, drawn to flame. It corrects its fall toward your lantern. Step aside and let it drown." },
];

const MARQUEE = [
  ["月", "Moonlight"], ["蛍", "Fireflies"], ["水", "Still Water"],
  ["星", "Starlit Sky"], ["風", "The Long Scarf"], ["夜歩", "Night Walking"],
];

function buildContent() {
  $("stepGrid").innerHTML = STEPS.map((s) => `
    <article class="step reveal">
      <div class="step-head"><span class="step-num">${s.n}</span><span class="step-jp">${s.jp}</span></div>
      <h3>${s.t}</h3><p>${s.d}</p>
    </article>`).join("");

  $("beastGrid").innerHTML = BEASTS.map((b) => `
    <article class="beast reveal">
      <div class="beast-head">
        <span class="orb" style="background:${b.core};--glow:${b.glow}"></span>
        <span class="beast-jp">${b.jp}</span>
      </div>
      <h3>${b.name}</h3>
      <p class="worth">${b.worth}</p>
      <p class="desc">${b.d}</p>
    </article>`).join("");

  const items = [...MARQUEE, ...MARQUEE]
    .map(([jp, en]) => `<span class="marquee-item"><span class="jp">${jp}</span><span class="en">${en}</span></span><span class="marquee-sep">✦</span>`)
    .join("");
  $("marquee").innerHTML = items + items;

  $("year").textContent = new Date().getFullYear();
}

/* ---------------------------------------------- chronicle */

function fmtDate(ts) {
  try { return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
  catch { return "—"; }
}

function renderChronicle() {
  const runs = store.runs();
  const list = $("runs");

  list.innerHTML = runs.length
    ? runs.map((r, i) => `
      <li>
        <div class="run-left">
          <span class="run-rank">${String(i + 1).padStart(2, "0")}</span>
          <span class="run-score">${r.score.toLocaleString()}</span>
          ${i === 0 ? '<span class="run-tag">finest</span>' : ""}
        </div>
        <div class="run-right">
          <span>phase <b>${r.phase}</b></span>
          <span>chain <b>${r.chain}</b></span>
          <span>${r.difficulty ? r.difficulty.slice(0, 4) : "—"}</span>
          <span>${fmtDate(r.at)}</span>
        </div>
      </li>`).join("")
    : `<li><span class="empty">No nights recorded yet — the water is still.</span></li>`;

  const total = runs.reduce((a, r) => a + r.score, 0);
  const caught = runs.reduce((a, r) => a + (r.caught || 0), 0);
  $("totals").innerHTML = `
    <div><p>Nights walked</p><b>${runs.length}</b></div>
    <div><p>Light gathered</p><b>${total.toLocaleString()}</b></div>
    <div><p>Motes caught</p><b>${caught.toLocaleString()}</b></div>
    <div><p>Best night</p><b>${store.best().toLocaleString()}</b></div>`;
}

/* ---------------------------------------------- HUD */

const hud = {
  score: $("score"), best: $("best"), phase: $("phase"), arc: $("phaseArc"),
  light: $("lightBar"), meter: null, combo: $("combo"), comboX: $("comboX"),
  moon: $("moonrise"), moonT: $("moonriseT"), pips: $("shieldPips"),
  dash: $("dashBar"), dashWrap: $("dashWrap"),
};
hud.meter = hud.light.parentElement;

let lastCombo = 0;
let lastShields = -1;

function paintHUD(s) {
  hud.score.textContent = s.score.toLocaleString();
  hud.best.textContent = Math.max(store.best(), s.score).toLocaleString();
  hud.phase.textContent = s.phase;

  const pct = s.target ? s.caught / s.target : 0;
  hud.arc.setAttribute("stroke-dasharray", `${pct * 132} 132`);

  hud.light.style.transform = `scaleX(${Math.max(0, s.light) / 100})`;
  hud.meter.classList.toggle("low", s.light < 30);

  const on = s.multiplier > 1;
  hud.combo.classList.toggle("is-on", on);
  hud.comboX.textContent = `×${s.multiplier}`;
  if (s.combo > lastCombo && on) {
    hud.combo.classList.remove("bump");
    void hud.combo.offsetWidth;
    hud.combo.classList.add("bump");
  }
  lastCombo = s.combo;

  if (s.moonrise > 0) {
    hud.moon.hidden = false;
    hud.moonT.textContent = s.moonrise.toFixed(1);
  } else hud.moon.hidden = true;

  if (s.shields !== lastShields) {
    hud.pips.innerHTML = "<i></i>".repeat(s.shields);
    lastShields = s.shields;
  }

  const d = Math.max(0, Math.min(1, s.dash));
  hud.dash.style.transform = `scaleX(${d})`;
  hud.dashWrap.classList.toggle("ready", d >= 1);
}

/* ---------------------------------------------- overlays */

const stage = $("stage");
const ov = { start: $("ovStart"), pause: $("ovPause"), over: $("ovOver") };

function showOverlay(which) {
  Object.entries(ov).forEach(([k, el]) => { el.hidden = k !== which; });
  stage.classList.toggle("is-playing", which === null);
  stage.classList.toggle("is-paused", which === "pause");
  $("pauseBtn").hidden = which !== null;
  $("stageHint").hidden = which !== null;
  $("touchPad").hidden = which !== null;
}

/* ---------------------------------------------- game */

const canvas = $("game");
let difficulty = (() => {
  try { return localStorage.getItem(DIFF_KEY) || "nocturne"; } catch { return "nocturne"; }
})();

const game = new LanternGame(canvas, {
  onState: paintHUD,
  onCatch: (step) => audio.catchNote(step),
  onBloom: () => audio.bloom(),
  onEmber: () => audio.ember(),
  onWisp: () => audio.wisp(),
  onShield: () => audio.shieldBreak(),
  onDash: () => audio.dash(),
  onDamage: () => audio.damage(),
  onPhase: () => audio.phase(),
  onOver: (r) => {
    audio.over();
    const prevBest = store.best();
    store.save({ ...r, at: Date.now() });
    $("finalScore").textContent = r.score.toLocaleString();
    $("finalPhase").textContent = r.phase;
    $("finalChain").textContent = r.chain;
    $("finalCaught").textContent = r.caught;
    $("finalBest").textContent = store.best().toLocaleString();
    $("recordBadge").hidden = !(r.score > prevBest && r.score > 0);
    renderChronicle();
    showOverlay("over");
  },
});

game.setDifficulty(difficulty);

const portrait = window.matchMedia("(max-aspect-ratio: 3/4)").matches;
const bgImg = new Image();
bgImg.src = portrait ? bgTall : bgWide;
bgImg.decoding = "async";
bgImg.onload = () => game.setBackground(bgImg);

game._loop();
hud.best.textContent = store.best().toLocaleString();

/* ---------------------------------------------- controls */

function beginRun() {
  game.start();
  showOverlay(null);
  if (audio.enabled) audio.setIntensity(0.2);
}

$("startBtn").addEventListener("click", () => { tryAudio(); beginRun(); });
$("againBtn").addEventListener("click", beginRun);
$("restartBtn").addEventListener("click", beginRun);
$("resumeBtn").addEventListener("click", () => { game.resume(); showOverlay(null); });
$("pauseBtn").addEventListener("click", () => { game.pause(); showOverlay("pause"); });

document.querySelectorAll(".diff-btn").forEach((btn) => {
  if (btn.dataset.diff === difficulty) {
    document.querySelectorAll(".diff-btn").forEach((b) => {
      b.classList.remove("is-on"); b.setAttribute("aria-checked", "false");
    });
    btn.classList.add("is-on");
    btn.setAttribute("aria-checked", "true");
  }
  btn.addEventListener("click", () => {
    difficulty = btn.dataset.diff;
    game.setDifficulty(difficulty);
    try { localStorage.setItem(DIFF_KEY, difficulty); } catch { /* noop */ }
    document.querySelectorAll(".diff-btn").forEach((b) => {
      const on = b === btn;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-checked", String(on));
    });
    audio.ui();
  });
});

$("shareBtn").addEventListener("click", async () => {
  const txt = `🏮 Lantern Keeper — I gathered ${$("finalScore").textContent} light, reached phase ${$("finalPhase").textContent} with a ×${$("finalChain").textContent} chain.\nPlay RuHRabin's nocturne → https://github.com/RuHRabin`;
  try {
    await navigator.clipboard.writeText(txt);
    $("shareBtn").textContent = "Copied ✦";
    setTimeout(() => ($("shareBtn").textContent = "Copy result"), 1800);
  } catch {
    $("shareBtn").textContent = "Copy failed";
    setTimeout(() => ($("shareBtn").textContent = "Copy result"), 1800);
  }
});

$("clearBtn").addEventListener("click", () => {
  store.clear();
  renderChronicle();
  hud.best.textContent = "0";
  audio.ui();
});

// pointer
canvas.addEventListener("pointermove", (e) => game.setPointer(e.clientX));
canvas.addEventListener("pointerdown", (e) => game.setPointer(e.clientX));
canvas.addEventListener("touchmove", (e) => {
  if (e.touches[0]) game.setPointer(e.touches[0].clientX);
  if (game.state === "playing") e.preventDefault();
}, { passive: false });

// keyboard
const heldKeys = new Set();
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (["arrowleft", "a"].includes(k)) { heldKeys.add("l"); game.setKeyDir(-1); e.preventDefault(); }
  else if (["arrowright", "d"].includes(k)) { heldKeys.add("r"); game.setKeyDir(1); e.preventDefault(); }
  else if (k === " ") {
    e.preventDefault();
    if (game.state === "playing") game.dash();
    else if (game.state === "idle" || game.state === "over") { tryAudio(); beginRun(); }
    else if (game.state === "paused") { game.resume(); showOverlay(null); }
  } else if (k === "p" || k === "escape") {
    if (game.state === "playing") { game.pause(); showOverlay("pause"); }
    else if (game.state === "paused") { game.resume(); showOverlay(null); }
  } else if (k === "r") {
    if (game.state !== "idle") beginRun();
  } else if (k === "m") {
    toggleSound();
  }
});
window.addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase();
  if (["arrowleft", "a"].includes(k)) heldKeys.delete("l");
  if (["arrowright", "d"].includes(k)) heldKeys.delete("r");
  game.setKeyDir(heldKeys.has("l") ? -1 : heldKeys.has("r") ? 1 : 0);
});

// touch buttons
document.querySelectorAll(".tbtn").forEach((btn) => {
  const dir = Number(btn.dataset.dir || 0);
  const isDash = btn.hasAttribute("data-dash");
  const press = (e) => {
    e.preventDefault();
    if (isDash) game.dash(); else game.setKeyDir(dir);
  };
  const release = (e) => { e.preventDefault(); if (!isDash) game.setKeyDir(0); };
  btn.addEventListener("pointerdown", press);
  btn.addEventListener("pointerup", release);
  btn.addEventListener("pointerleave", release);
  btn.addEventListener("pointercancel", release);
});

/* ---------------------------------------------- sound */

const soundBtn = $("soundBtn");

async function tryAudio() {
  let want = true;
  try { want = localStorage.getItem(SOUND_KEY) !== "off"; } catch { /* noop */ }
  if (want && !audio.enabled) {
    await audio.enable();
    soundBtn.setAttribute("aria-pressed", "true");
  }
}

async function toggleSound() {
  const on = await audio.toggle();
  soundBtn.setAttribute("aria-pressed", String(!!on));
  try { localStorage.setItem(SOUND_KEY, on ? "on" : "off"); } catch { /* noop */ }
}

soundBtn.addEventListener("click", toggleSound);

/* ---------------------------------------------- page chrome */

// resize
const ro = new ResizeObserver(() => game.resize());
ro.observe(stage);
window.addEventListener("orientationchange", () => setTimeout(() => game.resize(), 220));

// auto-pause when scrolled away
new IntersectionObserver(
  ([entry]) => {
    if (!entry.isIntersecting && game.state === "playing") {
      game.pause();
      showOverlay("pause");
    }
  },
  { threshold: 0.3 },
).observe(stage);

document.addEventListener("visibilitychange", () => {
  if (document.hidden && game.state === "playing") { game.pause(); showOverlay("pause"); }
});

// nav + scroll progress
const nav = $("nav");
const bar = $("scrollBar");
let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    nav.classList.toggle("is-scrolled", window.scrollY > 40);
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
  });
}
window.addEventListener("scroll", onScroll, { passive: true });

// reveal on scroll
function observeReveals() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en, i) => {
      if (!en.isIntersecting) return;
      setTimeout(() => en.target.classList.add("is-in"), i * 80);
      io.unobserve(en.target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
}

// soft UI click for links/buttons
document.addEventListener("click", (e) => {
  if (!audio.enabled) return;
  if (e.target.closest("a, button")) audio.ui();
});

/* ---------------------------------------------- boot */

buildContent();
renderChronicle();
observeReveals();
onScroll();
showOverlay("start");
