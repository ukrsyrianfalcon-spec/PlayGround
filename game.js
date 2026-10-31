/* SKYHOOK — Flappy, rehooked.
   A touch-first canvas game with pendulum grappling physics. */

(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Setup & constants
  // ---------------------------------------------------------------------------

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });

  const WORLD_H = 720;
  const GROUND_Y = 666;
  const GRAVITY = 820;
  const BASE_SPEED = 184;
  const MAX_ROPE = 432;
  const REEL_SPEED = 110;
  const REEL_PULL = 1500;
  const HOOK_SNAP = 0.74;
  const HOOK_MIN_LEN = 120;
  const HOOK_MAX_LEN = 224;
  const HOOK_COOLDOWN = 0.16;
  const BOOST_MIN_HOLD = 0.16;
  const PIPE_W = 72;
  const BIRD_R = 15;
  const TAU = Math.PI * 2;

  const el = {
    score: document.getElementById('score'),
    hudBest: document.getElementById('hudBest'),
    menuBest: document.getElementById('menuBest'),
    goBest: document.getElementById('goBest'),
    goScore: document.getElementById('goScore'),
    goKicker: document.getElementById('goKicker'),
    medal: document.getElementById('medal'),
    medalLabel: document.getElementById('medalLabel'),
    newBest: document.getElementById('newBest'),
    menu: document.getElementById('menu'),
    pause: document.getElementById('pause'),
    gameover: document.getElementById('gameover'),
    startBtn: document.getElementById('startBtn'),
    retryBtn: document.getElementById('retryBtn'),
    menuBtn: document.getElementById('menuBtn'),
    pauseBtn: document.getElementById('pauseBtn'),
    resumeBtn: document.getElementById('resumeBtn'),
    pauseRestartBtn: document.getElementById('pauseRestartBtn'),
    pauseMenuBtn: document.getElementById('pauseMenuBtn'),
    soundBtn: document.getElementById('soundBtn'),
    menuSoundToggle: document.getElementById('menuSoundToggle'),
    pauseSoundToggle: document.getElementById('pauseSoundToggle'),
    tiltToggle: document.getElementById('tiltToggle'),
    pauseTiltToggle: document.getElementById('pauseTiltToggle'),
    invertToggle: document.getElementById('invertToggle'),
    tiltHint: document.getElementById('tiltHint'),
    toast: document.getElementById('toast'),
    flash: document.getElementById('flash')
  };

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const mod = (n, m) => ((n % m) + m) % m;
  const hypot = Math.hypot;

  const reducedMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function readSave(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) { return fallback; }
  }

  function writeSave(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }

  // ---------------------------------------------------------------------------
  // View & background cache
  // ---------------------------------------------------------------------------

  let cssW = 0, cssH = 0, dpr = 1, unit = 1, W = 360;
  let bg = { stars: [], dust: [], clouds: [], far: null, mid: null, near: null };

  function layout() {
    cssW = window.innerWidth;
    cssH = window.innerHeight;
    // Keep the backing store within a sane pixel budget on large tablets and
    // desktops; the art is vector, so a slightly lower DPR still looks crisp.
    const pixelCap = Math.sqrt(2000000 / Math.max(1, cssW * cssH));
    dpr = Math.min(window.devicePixelRatio || 1, 2, Math.max(1, pixelCap));
    unit = cssH / WORLD_H;
    W = cssW / unit;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    buildBackdrop();
  }

  function makeSkyline(seed, tileW, minH, maxH, color, rim, winColor, density) {
    const rnd = mulberry32(seed);
    const buildings = [];
    let x = 0;
    while (x < tileW) {
      const w = 34 + rnd() * 84;
      const h = minH + rnd() * (maxH - minH);
      const b = { x, w, h, wins: [], antenna: rnd() < 0.16, antennaH: 14 + rnd() * 30 };
      const cols = Math.max(1, Math.floor((w - 10) / 13));
      const rows = Math.max(1, Math.floor(h / 17));
      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          if (rnd() < density) {
            b.wins.push({
              x: 6 + cx * 13,
              y: 8 + cy * 17,
              w: 2 + rnd() * 4,
              h: 2 + rnd() * 2.5,
              a: 0.2 + rnd() * 0.7,
              tint: rnd() < 0.18 ? '255,77,157' : rnd() < 0.3 ? '94,246,231' : winColor
            });
          }
        }
      }
      buildings.push(b);
      x += w + 3 + rnd() * 18;
    }
    return { tileW, buildings, color, rim };
  }

  function buildBackdrop() {
    const rnd = mulberry32(0x51c0);
    const stars = [];
    const starCount = Math.round(55 + W * 0.14);
    for (let i = 0; i < starCount; i++) {
      stars.push({
        x: rnd(), y: Math.pow(rnd(), 1.5) * 0.6,
        s: 0.5 + rnd() * 1.6, p: rnd() * TAU, a: 0.18 + rnd() * 0.7
      });
    }
    const dust = [];
    for (let i = 0; i < 30; i++) {
      dust.push({
        x: rnd(), y: rnd(), s: 0.7 + rnd() * 2.2,
        v: 5 + rnd() * 16, drift: rnd() * TAU, a: 0.1 + rnd() * 0.32
      });
    }
    const clouds = [];
    const cloudCount = Math.round(4 + W / 190);
    for (let i = 0; i < cloudCount; i++) {
      clouds.push({
        x: rnd(), y: 50 + rnd() * 270, w: 90 + rnd() * 190,
        h: 10 + rnd() * 16, a: 0.025 + rnd() * 0.05,
        v: 3 + rnd() * 9, f: 0.01 + rnd() * 0.03
      });
    }
    const tw = Math.max(1280, W * 1.55);
    bg = {
      stars, dust, clouds,
      far: makeSkyline(9211, tw, 48, 180, '#151b40', 'rgba(114,150,255,0.22)', '255,206,128', 0.045),
      mid: makeSkyline(4004, tw, 88, 275, '#0e1431', 'rgba(160,120,255,0.18)', '255,186,130', 0.075),
      near: makeSkyline(7331, tw, 140, 335, '#070a19', 'rgba(94,246,231,0.10)', '120,240,255', 0.04)
    };
  }

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------

  const game = {
    state: 'menu',
    time: 0,
    menuTime: 0,
    score: 0,
    best: Number(readSave('skyhook.best.v1', 0)) || 0,
    startBest: 0,
    runTime: 0,
    speed: BASE_SPEED,
    camera: { x: 0 },
    pipes: [],
    anchors: [],
    particles: [],
    popups: [],
    trail: [],
    shake: 0,
    deathTimer: 0,
    spawnX: 0,
    prevGapY: WORLD_H * 0.5,
    reason: '',
    trailTimer: 0,
    resumeGrace: 0
  };

  const bird = {
    x: 0, y: WORLD_H * 0.5, vx: 0, vy: 0, r: BIRD_R,
    angle: 0, wing: 0, attached: null, ropeLen: 0, ropeT: 0,
    alive: true, spin: 0, missT: 0, attachT: 0, hookCd: 0
  };

  const input = { holding: false, pointerId: null };

  // ---------------------------------------------------------------------------
  // Audio (procedural, no assets)
  // ---------------------------------------------------------------------------

  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.comp = null;
      this.delay = null;
      this.noiseBuf = null;
      this.muted = !!readSave('skyhook.muted.v1', false);
      this.musicEnabled = false;
      this.nextNote = 0;
    }

    ensure() {
      if (this.ctx) return this.ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        const c = new AC();
        const comp = c.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.knee.value = 18;
        comp.ratio.value = 5;
        comp.attack.value = 0.003;
        comp.release.value = 0.24;
        const master = c.createGain();
        master.gain.value = this.muted ? 0 : 0.5;
        comp.connect(master);
        master.connect(c.destination);
        const delay = c.createDelay(1);
        delay.delayTime.value = 0.27;
        const fb = c.createGain();
        fb.gain.value = 0.24;
        const wet = c.createGain();
        wet.gain.value = 0.22;
        delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(comp);
        const len = Math.floor(c.sampleRate * 0.6);
        const buf = c.createBuffer(1, len, c.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        this.ctx = c; this.master = master; this.comp = comp;
        this.delay = delay; this.noiseBuf = buf;
        return c;
      } catch (e) { return null; }
    }

    unlock() {
      const c = this.ensure();
      if (c && c.state === 'suspended') c.resume().catch(() => {});
    }

    setMuted(m) {
      this.muted = m;
      if (this.master && this.ctx) {
        this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.03);
      }
    }

    tone(freq, dur, type, vol, slideTo, delay, send) {
      const c = this.ctx;
      if (!c || this.muted) return;
      const t = c.currentTime + (delay || 0);
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(Math.max(20, freq), t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + Math.min(0.012, dur * 0.25));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(this.comp);
      if (send && this.delay) {
        const s = c.createGain();
        s.gain.value = send;
        g.connect(s); s.connect(this.delay);
      }
      o.start(t);
      o.stop(t + dur + 0.03);
    }

    noise(dur, vol, type, freq, delay) {
      const c = this.ctx;
      if (!c || this.muted || !this.noiseBuf) return;
      const t = c.currentTime + (delay || 0);
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = c.createBiquadFilter();
      f.type = type || 'bandpass';
      f.frequency.setValueAtTime(freq || 900, t);
      f.Q.value = 0.8;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.comp);
      src.start(t); src.stop(t + dur + 0.02);
    }

    play(name, value) {
      if (!this.ctx || this.muted) return;
      switch (name) {
        case 'shoot':
          this.tone(760, 0.1, 'sawtooth', 0.035, 150, 0, 0.15);
          this.noise(0.07, 0.018, 'highpass', 1400);
          break;
        case 'miss':
          this.tone(300, 0.07, 'sine', 0.02, 210);
          break;
        case 'attach':
          this.tone(620, 0.2, 'triangle', 0.11, null, 0, 0.35);
          this.tone(930, 0.24, 'sine', 0.07, null, 0.012, 0.4);
          this.tone(1390, 0.13, 'sine', 0.035, null, 0.03, 0.25);
          break;
        case 'release':
          this.noise(0.24, 0.06, 'bandpass', 1000);
          this.tone(320, 0.19, 'sine', 0.05, 780, 0, 0.2);
          break;
        case 'score': {
          const base = 620 + Math.min(7, value || 0) * 42;
          this.tone(base, 0.16, 'sine', 0.075, null, 0, 0.3);
          this.tone(base * 1.5, 0.2, 'sine', 0.055, null, 0.055, 0.34);
          break;
        }
        case 'death':
          this.tone(210, 0.55, 'sawtooth', 0.08, 40, 0, 0.18);
          this.noise(0.46, 0.07, 'lowpass', 760);
          this.tone(82, 0.65, 'sine', 0.1, 32, 0.02);
          break;
        case 'start':
          [523.25, 659.25, 783.99].forEach((f, i) =>
            this.tone(f, 0.3, 'triangle', 0.07, null, i * 0.075, 0.35));
          break;
        case 'ui':
          this.tone(640, 0.055, 'sine', 0.032);
          break;
      }
    }

    musicTick() {
      const c = this.ctx;
      if (!c || c.state !== 'running' || this.muted || !this.musicEnabled) return;
      const now = c.currentTime;
      if (!this.nextNote) this.nextNote = now + 0.4;
      if (now > this.nextNote + 1.2) this.nextNote = now + 0.2;
      const scale = [0, 3, 5, 7, 10, 12, 15];
      while (now >= this.nextNote) {
        const semi = scale[Math.floor(Math.random() * scale.length)] + (Math.random() < 0.18 ? 12 : 0);
        const freq = 130.81 * Math.pow(2, semi / 12);
        this.tone(freq, 1.7, 'triangle', 0.016, null, this.nextNote - now, 0.6);
        this.nextNote += 0.38 + Math.random() * 0.16;
      }
    }
  }

  const audio = new SoundEngine();

  // ---------------------------------------------------------------------------
  // Motion / tilt
  // ---------------------------------------------------------------------------

  const motion = {
    supported: typeof DeviceMotionEvent !== 'undefined' || typeof DeviceOrientationEvent !== 'undefined',
    enabled: false,
    calibrated: false,
    samples: [],
    neutral: 0,
    tilt: 0,
    source: null,
    sensorSeen: false,
    lastEvent: 0,
    permission: 'unknown',
    invert: !!readSave('skyhook.invert.v1', false),
    announced: false
  };

  function screenAngle() {
    try {
      if (window.screen && window.screen.orientation && typeof window.screen.orientation.angle === 'number') {
        return window.screen.orientation.angle;
      }
      if (typeof window.orientation === 'number') return window.orientation;
    } catch (e) { /* noop */ }
    return 0;
  }

  function feedTilt(value, fullScale) {
    motion.sensorSeen = true;
    motion.lastEvent = performance.now();
    if (!motion.calibrated) {
      motion.samples.push(value);
      if (motion.samples.length >= 10) {
        const sorted = motion.samples.slice().sort((a, b) => a - b);
        motion.neutral = sorted[Math.floor(sorted.length / 2)];
        motion.calibrated = true;
        motion.tilt = 0;
        updateTiltUI();
      }
      return;
    }
    let raw = (value - motion.neutral) / fullScale;
    if (Math.abs(raw) < 0.055) raw = 0;
    raw = clamp(raw, -1, 1);
    motion.tilt = lerp(motion.tilt, raw, 0.16);
  }

  function onDeviceMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    if (motion.source === 'orientation') return;
    motion.source = 'motion';
    const ang = screenAngle() * Math.PI / 180;
    const y = Math.sin(ang) * a.x + Math.cos(ang) * a.y;
    feedTilt(y, 4.2);
  }

  function onDeviceOrientation(e) {
    if (motion.source === 'motion') return;
    if (e.beta == null || e.gamma == null) return;
    motion.source = 'orientation';
    const ang = screenAngle() * Math.PI / 180;
    const v = e.beta * Math.cos(ang) + e.gamma * Math.sin(ang);
    feedTilt(v, 22);
  }

  function startMotionListeners() {
    if (!motion.enabled) return;
    window.addEventListener('devicemotion', onDeviceMotion, { passive: true });
    window.addEventListener('deviceorientation', onDeviceOrientation, { passive: true });
  }

  function stopMotionListeners() {
    window.removeEventListener('devicemotion', onDeviceMotion);
    window.removeEventListener('deviceorientation', onDeviceOrientation);
  }

  function enableTilt() {
    if (motion.enabled) return;
    motion.enabled = true;
    motion.calibrated = false;
    motion.samples = [];
    motion.tilt = 0;
    motion.source = null;
    motion.sensorSeen = false;
    motion.announced = false;
    startMotionListeners();
    updateTiltUI();
    showToast('Tilt on — lean to glide.', 2200);
    audio.play('ui');
    haptic(10);
    window.setTimeout(() => {
      if (motion.enabled && !motion.sensorSeen) {
        disableTilt();
        showToast('No motion data found — touch controls are ready.', 3000);
      }
    }, 2100);
  }

  function disableTilt() {
    if (!motion.enabled) return;
    motion.enabled = false;
    motion.tilt = 0;
    motion.calibrated = false;
    stopMotionListeners();
    updateTiltUI();
  }

  async function toggleTilt() {
    if (motion.enabled) {
      disableTilt();
      showToast('Tilt steering off.', 1800);
      audio.play('ui');
      return;
    }
    let permission = 'granted';
    try {
      const Orientation = window.DeviceOrientationEvent;
      const Motion = window.DeviceMotionEvent;
      if (Orientation && typeof Orientation.requestPermission === 'function') {
        permission = await Orientation.requestPermission();
      } else if (Motion && typeof Motion.requestPermission === 'function') {
        permission = await Motion.requestPermission();
      }
    } catch (e) {
      permission = 'denied';
    }
    motion.permission = permission;
    if (permission !== 'granted') {
      updateTiltUI();
      showToast('Motion access was blocked. Touch controls still work.', 3200);
      return;
    }
    if (!motion.supported) {
      updateTiltUI();
      showToast('This device has no motion sensor.', 2600);
      return;
    }
    enableTilt();
  }

  function updateTiltUI() {
    const on = motion.enabled;
    [el.tiltToggle, el.pauseTiltToggle].forEach(btn => {
      if (!btn) return;
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    if (el.invertToggle) el.invertToggle.setAttribute('aria-checked', motion.invert ? 'true' : 'false');
    if (!el.tiltHint) return;
    let text = "Optional · uses your device's motion sensor";
    let cls = '';
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const needsPermission = isIOS && typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function';
    if (on) {
      text = motion.calibrated ? 'Active · lean your device to glide' : 'Active · hold still to calibrate…';
      cls = 'good';
    } else if (motion.permission === 'denied') {
      text = 'Motion access blocked · touch always works';
      cls = 'warn';
    } else if (!motion.supported) {
      text = 'No motion sensor here · touch always works';
      cls = 'warn';
    } else if (needsPermission) {
      text = 'Optional · tap to allow motion access (iOS)';
    }
    el.tiltHint.textContent = text;
    el.tiltHint.classList.remove('good', 'warn');
    if (cls) el.tiltHint.classList.add(cls);
  }

  // ---------------------------------------------------------------------------
  // Interface helpers
  // ---------------------------------------------------------------------------

  let toastTimer = 0;

  function showToast(message, ms) {
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => el.toast.classList.remove('show'), ms || 2600);
  }

  function flashScreen() {
    if (!el.flash) return;
    el.flash.classList.add('show');
    window.setTimeout(() => el.flash.classList.remove('show'), 90);
  }

  function haptic(pattern) {
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch (e) { /* noop */ }
    }
  }

  function refreshBest() {
    if (el.hudBest) el.hudBest.textContent = game.best;
    if (el.menuBest) el.menuBest.textContent = game.best;
    if (el.goBest) el.goBest.textContent = game.best;
  }

  function setState(state) {
    game.state = state;
    document.body.dataset.state = state;
  }

  function syncSoundUI() {
    document.body.classList.toggle('muted', audio.muted);
    const label = audio.muted ? 'Unmute sound' : 'Mute sound';
    el.soundBtn.setAttribute('aria-label', label);
    el.menuSoundToggle.setAttribute('aria-checked', audio.muted ? 'false' : 'true');
    el.pauseSoundToggle.setAttribute('aria-checked', audio.muted ? 'false' : 'true');
  }

  function setMuted(m) {
    audio.setMuted(m);
    writeSave('skyhook.muted.v1', !!m);
    syncSoundUI();
    if (!m) audio.play('ui');
  }

  // ---------------------------------------------------------------------------
  // World generation
  // ---------------------------------------------------------------------------

  function pipeSpacing() {
    return Math.round(clamp(W * 0.92, 318, 440) + rand(-8, 14));
  }

  function addAnchor(x, y) {
    game.anchors.push({ x, y, phase: Math.random() * TAU });
  }

  function spawnPipe(x) {
    const gap = clamp(218 - game.score * 2.6, 166, 218);
    const minC = 98 + gap / 2;
    const maxC = GROUND_Y - 96 - gap / 2;
    let gapY;
    if (game.pipes.length === 0) {
      gapY = WORLD_H * 0.5 + rand(-50, 50);
    } else {
      gapY = game.prevGapY + rand(-138, 138);
    }
    gapY = clamp(gapY, minC, maxC);
    game.pipes.push({
      x,
      gapY,
      gap,
      w: PIPE_W,
      passed: false,
      seed: Math.random() * 1000
    });
    game.prevGapY = gapY;
    const anchorY = clamp(gapY - gap / 2 - 48 - rand(0, 14), 86, 368);
    addAnchor(x - 96, anchorY);
  }

  function ensureWorld() {
    const horizon = game.camera.x + W + 420;
    let guard = 0;
    while (game.spawnX < horizon && guard++ < 24) {
      spawnPipe(game.spawnX);
      game.spawnX += pipeSpacing();
    }
    const cut = game.camera.x - 300;
    if (game.pipes.length > 4) game.pipes = game.pipes.filter(p => p.x > cut);
    if (game.anchors.length > 4) {
      game.anchors = game.anchors.filter(a => a === bird.attached || a.x > cut);
    }
  }

  // ---------------------------------------------------------------------------
  // Run lifecycle
  // ---------------------------------------------------------------------------

  function resetRun() {
    game.score = 0;
    game.startBest = game.best;
    game.runTime = 0;
    game.speed = BASE_SPEED;
    game.pipes.length = 0;
    game.anchors.length = 0;
    game.particles.length = 0;
    game.popups.length = 0;
    game.trail.length = 0;
    game.shake = 0;
    game.deathTimer = 0;
    game.trailTimer = 0;
    game.resumeGrace = 0;
    game.reason = '';
    game.beatBest = false;
    game.prevGapY = WORLD_H * 0.5;
    bird.x = 0;
    bird.y = WORLD_H * 0.5;
    bird.vx = BASE_SPEED;
    bird.vy = -40;
    bird.angle = 0;
    bird.wing = 0;
    bird.attached = null;
    bird.ropeLen = 0;
    bird.ropeT = 0;
    bird.alive = true;
    bird.spin = 0;
    bird.missT = 0;
    bird.attachT = 0;
    bird.hookCd = 0;
    game.camera.x = bird.x - W * 0.30;
    game.spawnX = bird.x + clamp(W * 0.64, 300, 540);
    ensureWorld();
    if (el.score) el.score.textContent = '0';
    refreshBest();
  }

  function startGame() {
    audio.unlock();
    audio.musicEnabled = true;
    audio.nextNote = 0;
    audio.play('start');
    hideOverlay(el.menu);
    hideOverlay(el.pause);
    hideOverlay(el.gameover);
    setState('playing');
    resetRun();
    requestWakeLock();
    el.score.classList.remove('pop');
  }

  function goMenu() {
    audio.musicEnabled = false;
    hideOverlay(el.pause);
    hideOverlay(el.gameover);
    showOverlay(el.menu);
    setState('menu');
    game.menuTime = 0;
    game.camera.x = 0;
    game.particles.length = 0;
    game.popups.length = 0;
    game.shake = 0;
    bird.attached = null;
    refreshBest();
    releaseWakeLock();
    updateTiltUI();
  }

  function showOverlay(node) {
    if (node) node.classList.remove('is-hidden');
  }

  function hideOverlay(node) {
    if (node) node.classList.add('is-hidden');
  }

  function pauseGame(auto) {
    if (game.state !== 'playing') return;
    setState('paused');
    input.holding = false;
    input.pointerId = null;
    showOverlay(el.pause);
    audio.musicEnabled = false;
    updateTiltUI();
    releaseWakeLock();
    if (!auto) audio.play('ui');
  }

  function resumeGame() {
    if (game.state !== 'paused') return;
    hideOverlay(el.pause);
    setState('playing');
    game.resumeGrace = 0.4;
    audio.musicEnabled = true;
    audio.nextNote = 0;
    audio.unlock();
    requestWakeLock();
    audio.play('ui');
  }

  function togglePause() {
    if (game.state === 'playing') pauseGame(false);
    else if (game.state === 'paused') resumeGame();
  }

  function addScore() {
    game.score++;
    if (el.score) {
      el.score.textContent = game.score;
      el.score.classList.remove('pop');
      void el.score.offsetWidth;
      el.score.classList.add('pop');
      window.setTimeout(() => el.score.classList.remove('pop'), 150);
    }
    if (el.hudBest) el.hudBest.textContent = Math.max(game.best, game.score);
    if (game.score > game.best) {
      game.best = game.score;
      writeSave('skyhook.best.v1', game.best);
      refreshBest();
    }
    addPopup(bird.x + 16, bird.y - 30, '+1', '255,200,87');
    spawnBurst(bird.x, bird.y, ['255,200,87', '94,246,231', '255,255,255'], 13, 150, 0.55, 2.4);
    audio.play('score', game.score);
    haptic(6);
  }

  function die(reason) {
    if (game.state !== 'playing') return;
    game.reason = reason;
    setState('dying');
    game.deathTimer = 0;
    bird.alive = false;
    bird.attached = null;
    bird.spin = rand(-6, 6);
    bird.vy = Math.min(bird.vy, -245);
    bird.vx = Math.max(bird.vx, 145);
    game.shake = reducedMotion ? 4 : 17;
    game.beatBest = game.score > game.startBest;
    game.best = Math.max(game.best, game.score);
    writeSave('skyhook.best.v1', game.best);
    refreshBest();
    spawnExplosion(bird.x, bird.y);
    flashScreen();
    audio.play('death');
    audio.musicEnabled = false;
    haptic([28, 42, 80]);
    releaseWakeLock();
  }

  function showGameOver() {
    if (game.state !== 'dying') return;
    setState('dead');
    hideOverlay(el.pause);
    showOverlay(el.gameover);
    if (el.goScore) el.goScore.textContent = game.score;
    if (el.goBest) el.goBest.textContent = game.best;
    if (el.newBest) el.newBest.classList.toggle('is-hidden', !game.beatBest);
    const kickers = {
      tower: 'CLIPPED A TOWER',
      ground: 'GRAVITY WINS',
      sky: 'LOST THE THREAD'
    };
    if (el.goKicker) el.goKicker.textContent = kickers[game.reason] || 'RUN OVER';
    let medalClass = '';
    let medalText = '';
    if (game.score >= 40) { medalClass = 'neon'; medalText = 'NEON'; }
    else if (game.score >= 25) { medalClass = 'gold'; medalText = 'GOLD'; }
    else if (game.score >= 12) { medalClass = 'silver'; medalText = 'SILVER'; }
    else if (game.score >= 5) { medalClass = 'bronze'; medalText = 'BRONZE'; }
    if (el.medal) {
      el.medal.className = 'medal' + (medalClass ? ' ' + medalClass : '');
      el.medal.classList.toggle('is-hidden', !medalClass);
    }
    if (el.medalLabel) el.medalLabel.textContent = medalText;
    if (medalClass) {
      el.medal.style.animation = 'none';
      void el.medal.offsetWidth;
      el.medal.style.animation = '';
    }
  }

  // ---------------------------------------------------------------------------
  // Grappling
  // ---------------------------------------------------------------------------

  function findTarget() {
    let best = null;
    let bestScore = Infinity;
    const range = MAX_ROPE;
    for (let i = 0; i < game.anchors.length; i++) {
      const a = game.anchors[i];
      const dx = a.x - bird.x;
      const dy = a.y - bird.y;
      if (dx < -24) continue;
      const d = hypot(dx, dy);
      if (d < 58 || d > range) continue;
      const sx = a.x - game.camera.x;
      if (sx < -8 || sx > W + 26) continue;
      if (a.y > bird.y + 120) continue;
      let score = d;
      if (a.y > bird.y) score += 130;
      if (dx < 40) score += 70;
      score += Math.abs(dx - 170) * 0.16;
      if (score < bestScore) { bestScore = score; best = a; }
    }
    return best;
  }

  function tryGrapple() {
    if (game.state !== 'playing' || bird.attached || !bird.alive || bird.hookCd > 0) return;
    const target = findTarget();
    if (!target) {
      bird.missT = 0.18;
      audio.play('miss');
      return;
    }
    const d = hypot(bird.x - target.x, bird.y - target.y) || 0.001;
    const nx = (target.x - bird.x) / d;
    const ny = (target.y - bird.y) / d;
    bird.attached = target;
    bird.ropeLen = clamp(d * HOOK_SNAP, HOOK_MIN_LEN, HOOK_MAX_LEN);
    bird.ropeT = 0;
    bird.attachT = 0;
    // A short, satisfying tug toward the pivot.
    bird.vx += nx * 70;
    bird.vy += ny * 70;
    game.shake = Math.max(game.shake, 2.2);
    spawnBurst(target.x, target.y, ['94,246,231', '255,255,255', '255,200,87'], 16, 190, 0.6, 2.6);
    audio.play('attach');
    haptic(10);
  }

  function releaseGrapple() {
    if (!bird.attached || !bird.alive) return;
    const sp = hypot(bird.vx, bird.vy);
    if (bird.attachT > BOOST_MIN_HOLD && sp > 24) {
      bird.vx += bird.vx / sp * 78;
      bird.vy += bird.vy / sp * 78;
    }
    if (bird.attachT > BOOST_MIN_HOLD) bird.vy -= 38;
    bird.attached = null;
    bird.hookCd = HOOK_COOLDOWN;
    game.shake = Math.max(game.shake, 1.6);
    spawnBurst(bird.x, bird.y, ['255,200,87', '255,154,98', '94,246,231'], 13, 150, 0.42, 2);
    audio.play('release');
    haptic(8);
  }

  // ---------------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------------

  function circleRect(cx, cy, r, rx, ry, rw, rh) {
    const nx = clamp(cx, rx, rx + rw);
    const ny = clamp(cy, ry, ry + rh);
    const dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }

  function collide() {
    const half = PIPE_W * 0.5 + 2;
    for (let i = 0; i < game.pipes.length; i++) {
      const p = game.pipes[i];
      if (Math.abs(p.x - bird.x) > 140) continue;
      const gapTop = p.gapY - p.gap * 0.5;
      const gapBottom = p.gapY + p.gap * 0.5;
      if (bird.x + bird.r < p.x - half || bird.x - bird.r > p.x + half) continue;
      if (circleRect(bird.x, bird.y, bird.r, p.x - half, -40, half * 2, gapTop + 40) ||
          circleRect(bird.x, bird.y, bird.r, p.x - half, gapBottom, half * 2, GROUND_Y - gapBottom + 40)) {
        die('tower');
        return true;
      }
    }
    if (bird.y + bird.r >= GROUND_Y) {
      bird.y = GROUND_Y - bird.r;
      die('ground');
      return true;
    }
    return false;
  }

  function stepPhysics(h, tiltAccel) {
    bird.hookCd = Math.max(0, bird.hookCd - h);
    if (bird.attached) {
      bird.attachT += h;
      bird.vx += 132 * h;
    } else {
      const target = game.speed;
      const k = bird.vx < target ? 2.4 : 0.65;
      bird.vx += (target - bird.vx) * Math.min(1, k * h);
    }
    if (bird.vx > 780) bird.vx = 780;
    bird.vy += GRAVITY * h;
    if (tiltAccel) bird.vy += tiltAccel * h;
    bird.vy = clamp(bird.vy, -940, 980);
    bird.x += bird.vx * h;
    bird.y += bird.vy * h;

    if (bird.attached) {
      const a = bird.attached;
      bird.ropeLen = Math.max(HOOK_MIN_LEN, bird.ropeLen - REEL_SPEED * h);
      let dx = bird.x - a.x;
      let dy = bird.y - a.y;
      let d = hypot(dx, dy) || 0.001;
      if (d > bird.ropeLen) {
        const nx = dx / d, ny = dy / d;
        // Reel in at a capped speed so the hook feels like a fast yank
        // rather than a teleport when the bird is far from the ring.
        const pull = Math.min(d - bird.ropeLen, REEL_PULL * h);
        bird.x -= nx * pull;
        bird.y -= ny * pull;
        const radial = bird.vx * nx + bird.vy * ny;
        if (radial > 0) {
          bird.vx -= nx * radial;
          bird.vy -= ny * radial;
        }
        bird.vx *= 0.9993;
        bird.vy *= 0.9993;
      }
    }

    if (bird.y < bird.r) {
      bird.y = bird.r;
      if (bird.vy < 0) bird.vy = 0;
    }

    let ang = Math.atan2(bird.vy, Math.max(70, bird.vx)) * 0.66;
    if (bird.attached) ang = Math.atan2(bird.vy, Math.max(55, bird.vx)) * 0.56;
    bird.angle = lerp(bird.angle, clamp(ang, -0.92, 0.92), Math.min(1, h * 13));
  }

  function updateRun(dt) {
    game.runTime += dt;
    game.speed = BASE_SPEED + Math.min(94, game.score * 3.2);
    if (game.resumeGrace > 0) {
      game.resumeGrace -= dt;
      updateTrail(dt);
      updateParticles(dt);
      updatePopups(dt);
      game.shake *= Math.pow(0.02, dt);
      audio.musicTick();
      return;
    }
    const tiltAccel = motion.enabled
      ? (motion.invert ? -motion.tilt : motion.tilt) * 355
      : 0;
    if (motion.enabled && performance.now() - motion.lastEvent > 260) {
      motion.tilt *= Math.pow(0.12, dt);
    }

    const steps = Math.min(6, Math.max(1, Math.ceil(dt / 0.011)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      stepPhysics(h, tiltAccel);
      if (collide()) return;
    }

    for (let i = 0; i < game.pipes.length; i++) {
      const p = game.pipes[i];
      if (!p.passed && bird.x > p.x + p.w * 0.5 + bird.r * 0.7) {
        p.passed = true;
        addScore();
      }
    }

    ensureWorld();

    const targetCam = bird.x - W * 0.30;
    let followCam = targetCam;
    if (bird.attached) {
      // Keep the pivot on screen so the rope never runs off into nowhere.
      followCam = Math.min(targetCam, bird.attached.x - 30);
    }
    game.camera.x = lerp(game.camera.x, followCam, 1 - Math.pow(0.000001, dt));

    bird.wing += dt * (bird.attached ? 23 : 15);
    bird.missT = Math.max(0, bird.missT - dt);
    if (bird.attached) bird.ropeT += dt;

    game.trailTimer -= dt;
    if (game.trailTimer <= 0) {
      game.trailTimer = 0.026;
      game.trail.push({ x: bird.x, y: bird.y, life: 0.42, max: 0.42, r: bird.r * 0.8 });
      if (game.trail.length > 26) game.trail.shift();
    }

    updateTrail(dt);
    updateParticles(dt);
    updatePopups(dt);
    game.shake *= Math.pow(0.02, dt);
    audio.musicTick();
  }

  function updateDeath(dt) {
    game.deathTimer += dt;
    bird.vy += GRAVITY * 0.9 * dt;
    bird.x += bird.vx * dt;
    bird.y += bird.vy * dt;
    bird.vx *= Math.pow(0.62, dt);
    bird.angle += bird.spin * dt;
    if (bird.y > GROUND_Y - bird.r) {
      bird.y = GROUND_Y - bird.r;
      bird.vy *= -0.22;
      bird.spin *= 0.7;
      bird.vx *= 0.7;
      if (Math.abs(bird.vy) < 40) bird.vy = 0;
    }
    game.camera.x = lerp(game.camera.x, bird.x - W * 0.30, 1 - Math.pow(0.00001, dt));
    updateTrail(dt);
    updateParticles(dt);
    updatePopups(dt);
    game.shake *= Math.pow(0.03, dt);
    audio.musicTick();
    if (game.deathTimer >= 1.02) showGameOver();
  }

  function updateDead(dt) {
    updateTrail(dt);
    updateParticles(dt);
    updatePopups(dt);
    game.shake *= Math.pow(0.02, dt);
    audio.musicTick();
  }

  function updateAmbient(dt) {
    for (let i = 0; i < bg.dust.length; i++) {
      const d = bg.dust[i];
      d.y -= d.v * dt / WORLD_H;
      d.x += Math.sin(game.time * 0.5 + d.drift) * 0.008 * dt;
      if (d.y < -0.06) { d.y = 1.04; d.x = Math.random(); }
      if (d.x < -0.05) d.x = 1.04;
      else if (d.x > 1.05) d.x = -0.04;
    }
  }

  // ---------------------------------------------------------------------------
  // Particles & floating text
  // ---------------------------------------------------------------------------

  function spawnBurst(x, y, palette, count, speed, life, size) {
    if (game.particles.length > 320) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const v = rand(speed * 0.18, speed);
      game.particles.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: rand(life * 0.45, life),
        max: life,
        size: rand(1.1, size),
        color: palette[Math.floor(Math.random() * palette.length)],
        grav: rand(120, 380),
        drag: 0.985,
        spark: Math.random() < 0.3
      });
    }
  }

  function spawnExplosion(x, y) {
    spawnBurst(x, y, ['255,200,87', '255,90,130', '94,246,231', '255,255,255'], 42, 330, 1.05, 3.6);
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * TAU;
      game.particles.push({
        x, y,
        vx: Math.cos(a) * rand(220, 520),
        vy: Math.sin(a) * rand(220, 520),
        life: rand(0.5, 0.95), max: 1,
        size: rand(1.2, 2.2),
        color: '255,240,200', grav: 300, drag: 0.978, spark: true
      });
    }
  }

  function updateParticles(dt) {
    for (let i = game.particles.length - 1; i >= 0; i--) {
      const p = game.particles[i];
      p.life -= dt;
      if (p.life <= 0) { game.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.grav * dt;
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy *= Math.pow(p.drag, dt * 60);
    }
  }

  function updateTrail(dt) {
    for (let i = game.trail.length - 1; i >= 0; i--) {
      const t = game.trail[i];
      t.life -= dt;
      if (t.life <= 0) game.trail.splice(i, 1);
    }
  }

  function addPopup(x, y, text, color) {
    game.popups.push({ x, y, text, color, life: 0.9, max: 0.9 });
  }

  function updatePopups(dt) {
    for (let i = game.popups.length - 1; i >= 0; i--) {
      const p = game.popups[i];
      p.y -= 34 * dt;
      p.life -= dt;
      if (p.life <= 0) game.popups.splice(i, 1);
    }
  }

  // ---------------------------------------------------------------------------
  // Wake lock
  // ---------------------------------------------------------------------------

  let wakeLock = null;

  async function requestWakeLock() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try {
      if (wakeLock) return;
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (e) { wakeLock = null; }
  }

  function releaseWakeLock() {
    if (wakeLock) {
      try { wakeLock.release(); } catch (e) { /* noop */ }
      wakeLock = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering: backdrop
  // ---------------------------------------------------------------------------

  function drawBackground() {
    const cam = game.camera.x;
    const t = game.time;

    const sky = ctx.createLinearGradient(0, -30, 0, WORLD_H + 30);
    sky.addColorStop(0, '#040716');
    sky.addColorStop(0.32, '#0a0f2c');
    sky.addColorStop(0.56, '#24164c');
    sky.addColorStop(0.74, '#5d275e');
    sky.addColorStop(0.87, '#bd445c');
    sky.addColorStop(1, '#ff8d5f');
    ctx.fillStyle = sky;
    ctx.fillRect(-40, -40, W + 80, WORLD_H + 80);

    // Nebula pools
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    let neb = ctx.createRadialGradient(W * 0.16, 90, 0, W * 0.16, 90, 310);
    neb.addColorStop(0, 'rgba(128, 66, 255, 0.14)');
    neb.addColorStop(1, 'rgba(128, 66, 255, 0)');
    ctx.fillStyle = neb;
    ctx.fillRect(-30, -30, W + 60, WORLD_H * 0.7);
    neb = ctx.createRadialGradient(W * 0.86, 270, 0, W * 0.86, 270, 270);
    neb.addColorStop(0, 'rgba(52, 220, 225, 0.10)');
    neb.addColorStop(1, 'rgba(52, 220, 225, 0)');
    ctx.fillStyle = neb;
    ctx.fillRect(-30, 0, W + 60, WORLD_H * 0.75);
    ctx.restore();

    // Stars
    for (let i = 0; i < bg.stars.length; i++) {
      const s = bg.stars[i];
      const x = mod(s.x * W - cam * 0.022, W + 30) - 15;
      const y = s.y * WORLD_H * 0.82;
      const tw = 0.55 + 0.45 * Math.sin(t * 1.1 + s.p);
      ctx.fillStyle = 'rgba(214, 239, 255,' + (s.a * tw).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(x, y, s.s * (0.8 + tw * 0.35), 0, TAU);
      ctx.fill();
    }

    drawSun(cam, t);

    // Cloud streaks
    for (let i = 0; i < bg.clouds.length; i++) {
      const c = bg.clouds[i];
      const x = mod(c.x * W - cam * c.f - t * c.v, W + 300) - 150;
      const y = c.y;
      ctx.fillStyle = 'rgba(255, 166, 188,' + c.a.toFixed(3) + ')';
      ctx.beginPath();
      ctx.ellipse(x, y, c.w * 0.5, c.h, 0, 0, TAU);
      ctx.ellipse(x + c.w * 0.3, y - c.h * 0.35, c.w * 0.32, c.h * 0.8, 0, 0, TAU);
      ctx.ellipse(x - c.w * 0.27, y + c.h * 0.2, c.w * 0.3, c.h * 0.65, 0, 0, TAU);
      ctx.fill();
    }

    drawSkyline(bg.far, 0.055, 0.92);
    drawSkyline(bg.mid, 0.13, 1);
    drawSkyline(bg.near, 0.26, 1);
    drawGround(cam);

    // Ambient embers
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < bg.dust.length; i++) {
      const d = bg.dust[i];
      const x = d.x * W + Math.sin(t * 0.6 + d.drift) * 9;
      const y = d.y * WORLD_H;
      const a = d.a * (0.6 + 0.4 * Math.sin(t * 1.4 + d.drift));
      ctx.fillStyle = i % 3 === 0
        ? 'rgba(94, 246, 231,' + a.toFixed(3) + ')'
        : 'rgba(255, 186, 120,' + a.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(x, y, d.s, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSun(cam, t) {
    const x = W * 0.73 - cam * 0.006;
    const y = 228;
    const r = 86;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    let glow = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 2.9);
    glow.addColorStop(0, 'rgba(255, 190, 120, 0.26)');
    glow.addColorStop(0.45, 'rgba(255, 90, 140, 0.1)');
    glow.addColorStop(1, 'rgba(255, 80, 130, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
    ctx.restore();

    const disc = ctx.createLinearGradient(0, y - r, 0, y + r);
    disc.addColorStop(0, '#fff4c7');
    disc.addColorStop(0.38, '#ffd072');
    disc.addColorStop(0.75, '#ff8a78');
    disc.addColorStop(1, '#ff4d85');
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.clip();
    ctx.fillStyle = 'rgba(23, 13, 45, 0.62)';
    for (let i = 0; i < 6; i++) {
      const barY = y + 14 + i * (15 + i * 1.6);
      const h = 3 + i * 1.4;
      ctx.fillRect(x - r, barY, r * 2, h);
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(255, 236, 190, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r - 0.5, 0, TAU);
    ctx.stroke();
  }

  function drawSkyline(layer, factor, alpha) {
    if (!layer) return;
    const off = -mod(game.camera.x * factor, layer.tileW);
    const tiles = Math.ceil(W / layer.tileW) + 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (let tile = -1; tile < tiles; tile++) {
      const base = off + tile * layer.tileW;
      for (let i = 0; i < layer.buildings.length; i++) {
        const b = layer.buildings[i];
        const x = base + b.x;
        if (x > W + 60 || x + b.w < -60) continue;
        const y = GROUND_Y - b.h + 8;
        ctx.fillStyle = layer.color;
        ctx.fillRect(x, y, b.w, b.h);
        ctx.fillStyle = layer.rim;
        ctx.fillRect(x, y, b.w, 1.4);
        if (b.antenna) {
          ctx.fillStyle = 'rgba(148, 186, 255, 0.16)';
          ctx.fillRect(x + b.w * 0.5 - 0.6, y - b.antennaH, 1.2, b.antennaH);
          ctx.fillStyle = 'rgba(255, 90, 130, 0.6)';
          ctx.beginPath();
          ctx.arc(x + b.w * 0.5, y - b.antennaH, 1.6, 0, TAU);
          ctx.fill();
        }
        for (let k = 0; k < b.wins.length; k++) {
          const w = b.wins[k];
          ctx.fillStyle = 'rgba(' + w.tint + ',' + (w.a * 0.72).toFixed(3) + ')';
          ctx.fillRect(x + w.x, y + w.y, w.w, w.h);
        }
      }
    }
    ctx.restore();
  }

  function drawGround(cam) {
    const g = ctx.createLinearGradient(0, GROUND_Y, 0, WORLD_H + 20);
    g.addColorStop(0, '#0b1027');
    g.addColorStop(0.4, '#060918');
    g.addColorStop(1, '#03050d');
    ctx.fillStyle = g;
    ctx.fillRect(-40, GROUND_Y, W + 80, WORLD_H - GROUND_Y + 40);

    // Sun reflected on the damp street
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createLinearGradient(W * 0.73 - 90, GROUND_Y, W * 0.73 + 90, GROUND_Y);
    glow.addColorStop(0, 'rgba(255, 110, 130, 0)');
    glow.addColorStop(0.5, 'rgba(255, 120, 120, 0.11)');
    glow.addColorStop(1, 'rgba(255, 110, 130, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(W * 0.73 - 90, GROUND_Y, 180, 54);
    ctx.restore();

    ctx.strokeStyle = 'rgba(94, 246, 231, 0.55)';
    ctx.shadowColor = 'rgba(94, 246, 231, 0.7)';
    ctx.shadowBlur = 11;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-20, GROUND_Y + 0.5);
    ctx.lineTo(W + 20, GROUND_Y + 0.5);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Lane lights
    const step = 86;
    const offset = -mod(cam * 0.72, step);
    for (let x = offset - step; x < W + step; x += step) {
      ctx.fillStyle = 'rgba(255, 176, 112, 0.32)';
      ctx.fillRect(x, GROUND_Y + 22, 22, 2);
      ctx.fillStyle = 'rgba(94, 246, 231, 0.18)';
      ctx.fillRect(x + 44, GROUND_Y + 34, 13, 1.4);
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering: world
  // ---------------------------------------------------------------------------

  function roundRectPath(x, y, w, h, r) {
    const rr = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawPipeHalf(cx, edgeY, top) {
    const half = PIPE_W * 0.5;
    const bodyTop = top ? -24 : edgeY;
    const bodyBottom = top ? edgeY : WORLD_H + 24;
    const bodyH = bodyBottom - bodyTop;

    const body = ctx.createLinearGradient(cx - half, 0, cx + half, 0);
    body.addColorStop(0, '#060a19');
    body.addColorStop(0.2, '#131d43');
    body.addColorStop(0.48, '#263873');
    body.addColorStop(0.64, '#1a2757');
    body.addColorStop(1, '#050813');
    ctx.fillStyle = body;
    ctx.fillRect(cx - half, bodyTop, PIPE_W, bodyH);

    // inset panel
    ctx.fillStyle = 'rgba(6, 10, 26, 0.55)';
    ctx.fillRect(cx - half + 11, bodyTop, PIPE_W - 22, bodyH);
    ctx.strokeStyle = 'rgba(108, 158, 255, 0.13)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - half + 11.5, bodyTop + 0.5, PIPE_W - 23, bodyH - 1);

    // neon edges
    ctx.save();
    ctx.strokeStyle = top ? 'rgba(94, 246, 231, 0.7)' : 'rgba(255, 77, 157, 0.62)';
    ctx.shadowColor = top ? 'rgba(94, 246, 231, 0.85)' : 'rgba(255, 77, 157, 0.75)';
    ctx.shadowBlur = 15;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(cx - half + 1, bodyTop);
    ctx.lineTo(cx - half + 1, bodyBottom);
    ctx.moveTo(cx + half - 1, bodyTop);
    ctx.lineTo(cx + half - 1, bodyBottom);
    ctx.stroke();
    ctx.restore();

    // inner edge light
    ctx.strokeStyle = top ? 'rgba(168,255,245,0.16)' : 'rgba(255,176,205,0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - half + 6, bodyTop);
    ctx.lineTo(cx - half + 6, bodyBottom);
    ctx.moveTo(cx + half - 6, bodyTop);
    ctx.lineTo(cx + half - 6, bodyBottom);
    ctx.stroke();

    // running lights
    const startY = Math.ceil((bodyTop + 30) / 78) * 78;
    for (let y = startY; y < bodyBottom - 20; y += 78) {
      const pulse = 0.5 + 0.5 * Math.sin(game.time * 2 + y * 0.03);
      ctx.fillStyle = 'rgba(94, 246, 231,' + (0.18 + pulse * 0.3).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(cx + half - 7.5, y, 1.7, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 200, 87,' + (0.12 + pulse * 0.18).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(cx - half + 7.5, y + 39, 1.3, 0, TAU);
      ctx.fill();
    }

    // cap
    const capW = PIPE_W + 22;
    const capH = 30;
    const capY = top ? edgeY - capH : edgeY;
    const cap = ctx.createLinearGradient(cx - capW / 2, 0, cx + capW / 2, 0);
    cap.addColorStop(0, '#0a0f27');
    cap.addColorStop(0.24, '#2e4585');
    cap.addColorStop(0.52, '#182451');
    cap.addColorStop(0.8, '#0d1431');
    cap.addColorStop(1, '#060a18');
    ctx.fillStyle = cap;
    roundRectPath(cx - capW / 2, capY, capW, capH, 7);
    ctx.fill();

    ctx.save();
    ctx.strokeStyle = top ? 'rgba(255, 77, 157, 0.8)' : 'rgba(94, 246, 231, 0.75)';
    ctx.shadowColor = top ? 'rgba(255, 77, 157, 0.7)' : 'rgba(94, 246, 231, 0.7)';
    ctx.shadowBlur = 16;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();

    // cap face line
    const faceY = top ? edgeY - 4 : edgeY + 4;
    ctx.strokeStyle = top ? 'rgba(255, 255, 255, 0.34)' : 'rgba(255, 255, 255, 0.26)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - capW / 2 + 7, faceY);
    ctx.lineTo(cx + capW / 2 - 7, faceY);
    ctx.stroke();

    // hazard slashes
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 200, 87, 0.38)';
    ctx.lineWidth = 2;
    const stripeY = top ? edgeY - 42 : edgeY + 34;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * 17 - 5, stripeY);
      ctx.lineTo(cx + i * 17 + 5, stripeY + 10);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPipes() {
    for (let i = 0; i < game.pipes.length; i++) {
      const p = game.pipes[i];
      const x = p.x - game.camera.x;
      if (x < -110 || x > W + 110) continue;
      const gapTop = p.gapY - p.gap * 0.5;
      const gapBottom = p.gapY + p.gap * 0.5;
      drawPipeHalf(x, gapTop, true);
      drawPipeHalf(x, gapBottom, false);
    }
  }

  function drawAnchorShape(x, y, phase, isTarget, attached, scale, alpha) {
    const r = 14 * scale;
    const pulse = 1 + Math.sin(game.time * 3.1 + phase) * 0.08;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
    const col = attached ? '255,77,157' : isTarget ? '255,255,255' : '94,246,231';
    halo.addColorStop(0, 'rgba(' + col + ',0.22)');
    halo.addColorStop(0.5, 'rgba(' + col + ',0.07)');
    halo.addColorStop(1, 'rgba(' + col + ',0)');
    ctx.fillStyle = halo;
    ctx.fillRect(x - r * 3.2, y - r * 3.2, r * 6.4, r * 6.4);
    ctx.restore();

    ctx.translate(x, y);

    ctx.save();
    ctx.rotate(game.time * 0.55 + phase);
    ctx.strokeStyle = attached ? 'rgba(255,150,190,0.55)' : 'rgba(168,255,245,0.4)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 7]);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.85 * pulse, 0, TAU);
    ctx.stroke();
    ctx.restore();

    const ring = ctx.createLinearGradient(-r, -r, r, r);
    ring.addColorStop(0, attached ? '#ffd0e2' : '#e9fffb');
    ring.addColorStop(0.45, attached ? '#ff4d9d' : '#5ef6e7');
    ring.addColorStop(1, attached ? '#ff9a62' : '#7aa9ff');
    ctx.strokeStyle = ring;
    ctx.lineWidth = 2.4 * scale;
    ctx.shadowColor = attached ? 'rgba(255,77,157,.9)' : 'rgba(94,246,231,.85)';
    ctx.shadowBlur = isTarget ? 18 : 10;
    ctx.beginPath();
    ctx.arc(0, 0, r * pulse, 0, TAU);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = attached ? 'rgba(255,77,157,0.9)' : 'rgba(218,255,250,0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, 2.4 * scale, 0, TAU);
    ctx.fill();

    if (isTarget && !attached) {
      ctx.strokeStyle = 'rgba(255,255,255,0.86)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.45 * pulse, 0, TAU);
      ctx.stroke();
    }

    if (attached) {
      ctx.strokeStyle = 'rgba(255,246,233,0.95)';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        const a = k * TAU / 3 + game.time * 0.4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 4, Math.sin(a) * 4);
        ctx.quadraticCurveTo(
          Math.cos(a + 0.5) * r * 1.1, Math.sin(a + 0.5) * r * 1.1,
          Math.cos(a + 0.18) * r * 1.45, Math.sin(a + 0.18) * r * 1.45
        );
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawAnchors(target) {
    for (let i = 0; i < game.anchors.length; i++) {
      const a = game.anchors[i];
      const x = a.x - game.camera.x;
      if (x < -60 || x > W + 60) continue;
      const isTarget = a === target;
      drawAnchorShape(x, a.y, a.phase, isTarget, a === bird.attached, isTarget ? 1.08 : 1, 1);
    }
  }

  function drawRope() {
    if (!bird.attached) return;
    const ax = bird.attached.x - game.camera.x;
    const ay = bird.attached.y;
    const bx = bird.x - game.camera.x;
    const by = bird.y;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(94, 246, 231, 0.17)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(ax, ay);
    ctx.stroke();

    const grad = ctx.createLinearGradient(bx, by, ax, ay);
    grad.addColorStop(0, 'rgba(255, 246, 233, 0.9)');
    grad.addColorStop(0.55, 'rgba(168, 255, 245, 0.95)');
    grad.addColorStop(1, 'rgba(94, 246, 231, 0.95)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(ax, ay);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(ax, ay);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 3; i++) {
      const p = mod(game.time * 1.15 + i / 3, 1);
      const px = lerp(bx, ax, p);
      const py = lerp(by, ay, p);
      ctx.beginPath();
      ctx.arc(px, py, 1.3, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawTrail() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < game.trail.length; i++) {
      const t = game.trail[i];
      const a = Math.max(0, t.life / t.max);
      const x = t.x - game.camera.x;
      const y = t.y;
      const r = t.r * (0.35 + a * 0.65);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255, 175, 110,' + (a * 0.18).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255, 120, 160, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBird(x, y, angle, wing, scale, alpha, attached) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);

    const flap = Math.sin(wing) * 0.6;

    // Scarf
    const wave = Math.sin(wing * 0.72) * 2.2;
    const scarf = ctx.createLinearGradient(-38, 0, -6, 0);
    scarf.addColorStop(0, 'rgba(255,77,157,0.9)');
    scarf.addColorStop(0.6, 'rgba(255,120,150,0.95)');
    scarf.addColorStop(1, 'rgba(94,246,231,0.95)');
    ctx.strokeStyle = scarf;
    ctx.lineWidth = 5.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-11, 1);
    ctx.bezierCurveTo(-19, 4 + wave, -27, -4 + wave, -37, 1 + wave * 1.4);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-12, 1);
    ctx.bezierCurveTo(-20, 3 + wave, -28, -3 + wave, -36, 0 + wave * 1.4);
    ctx.stroke();

    // Tail
    ctx.fillStyle = '#e8723d';
    ctx.beginPath();
    ctx.moveTo(-13, -3);
    ctx.lineTo(-27, -9);
    ctx.lineTo(-21, -1);
    ctx.lineTo(-28, 6);
    ctx.lineTo(-13, 4);
    ctx.closePath();
    ctx.fill();

    // Back wing
    ctx.save();
    ctx.translate(-2, 3);
    ctx.rotate(-0.18 + flap * 0.75);
    ctx.fillStyle = '#d66334';
    ctx.beginPath();
    ctx.ellipse(-1, 0, 10.5, 4.6, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Body
    const body = ctx.createRadialGradient(-4, -6, 2, 1, 1, 21);
    body.addColorStop(0, '#fff8d9');
    body.addColorStop(0.38, '#ffd76e');
    body.addColorStop(0.74, '#ff9a52');
    body.addColorStop(1, '#f4654f');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 13.2, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(58, 22, 28, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Belly light
    ctx.fillStyle = 'rgba(255, 249, 220, 0.3)';
    ctx.beginPath();
    ctx.ellipse(1, 4, 10, 6.5, 0, 0, TAU);
    ctx.fill();

    // Beak
    ctx.fillStyle = '#ffb43f';
    ctx.beginPath();
    ctx.moveTo(14, -1.5);
    ctx.lineTo(23, 2.2);
    ctx.lineTo(14, 6.2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(106, 45, 12, 0.34)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Eye
    ctx.fillStyle = '#fffdf4';
    ctx.beginPath();
    ctx.arc(6.2, -4.4, 4.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#18213b';
    ctx.beginPath();
    ctx.arc(7.4, -4, 2.35, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(8.2, -4.9, 0.85, 0, TAU);
    ctx.fill();

    // Front wing
    ctx.save();
    ctx.translate(-1, 2.5);
    ctx.rotate(0.16 - flap * 0.85);
    const wg = ctx.createLinearGradient(-10, 0, 8, 0);
    wg.addColorStop(0, '#fff6d2');
    wg.addColorStop(0.6, '#ffcf72');
    wg.addColorStop(1, '#f39a54');
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.ellipse(-1.5, 0, 10.8, 4.9, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 52, 26, 0.28)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();

    if (attached) {
      ctx.strokeStyle = 'rgba(94,246,231,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 21, 0.4, 2.2);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawWorld() {
    const target = game.state === 'playing' ? (bird.attached || findTarget()) : null;
    drawPipes();
    drawAnchors(target);
    drawTrail();
    if (bird.attached) drawRope();
    if (bird.missT > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,200,120,' + (bird.missT / 0.18 * 0.5).toFixed(3) + ')';
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      const bx = bird.x - game.camera.x;
      const by = bird.y;
      ctx.beginPath();
      ctx.moveTo(bx + 12, by);
      ctx.lineTo(bx + 42, by - 18);
      ctx.lineTo(bx + 60, by - 4);
      ctx.stroke();
      ctx.restore();
    }
    drawBird(
      bird.x - game.camera.x, bird.y, bird.angle, bird.wing, 1, 1,
      !!bird.attached
    );

    drawParticles();
    drawPopups();

    if (game.state === 'playing' && game.score === 0 && game.runTime < 6) {
      drawCoach();
    }
  }

  function drawCoach() {
    const text = bird.attached ? 'RELEASE TO FLING' : 'HOLD TO HOOK';
    const alpha = Math.min(1, (6 - game.runTime) * 0.8) * (0.62 + Math.sin(game.time * 3) * 0.08);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '800 12px ui-rounded, "Avenir Next", "Segoe UI", sans-serif';
    const tw = ctx.measureText(text).width;
    const x = W * 0.5;
    const y = GROUND_Y - 34;
    ctx.fillStyle = 'rgba(4, 8, 22, 0.62)';
    roundRectPath(x - tw / 2 - 15, y - 17, tw + 30, 28, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(94, 246, 231, 0.24)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(235, 255, 252, 0.9)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y - 2);
    ctx.restore();
  }

  function drawParticles() {
    if (!game.particles.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < game.particles.length; i++) {
      const p = game.particles[i];
      const a = clamp(p.life / p.max, 0, 1);
      const x = p.x - game.camera.x;
      const y = p.y;
      if (x < -20 || x > W + 20) continue;
      if (p.spark) {
        ctx.strokeStyle = 'rgba(' + p.color + ',' + (a * 0.85).toFixed(3) + ')';
        ctx.lineWidth = p.size * 0.55;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - p.vx * 0.022, y - p.vy * 0.022);
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(' + p.color + ',' + (a * 0.8).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(x, y, p.size * (0.4 + a * 0.6), 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawPopups() {
    if (!game.popups.length) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < game.popups.length; i++) {
      const p = game.popups[i];
      const a = clamp(p.life / p.max, 0, 1);
      const x = p.x - game.camera.x;
      const y = p.y;
      ctx.font = '900 19px ui-rounded, "Avenir Next", "Segoe UI", sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(4, 8, 20,' + (a * 0.7).toFixed(3) + ')';
      ctx.strokeText(p.text, x, y);
      ctx.fillStyle = 'rgba(' + p.color + ',' + a.toFixed(3) + ')';
      ctx.fillText(p.text, x, y);
    }
    ctx.restore();
  }

  function drawMenuScene() {
    const t = game.menuTime;
    const ax = W * 0.79;
    const ay = 48;
    const orbit = Math.min(38, W * 0.09);
    const a = t * 0.62 + 0.74;
    const bx = ax + Math.cos(a) * orbit;
    const by = ay + Math.sin(a) * orbit;
    const wing = t * 7;

    drawAnchorShape(ax, ay, 0.4, true, false, 0.8, 0.9);
    drawAnchorShape(W * 0.15, 58, 2.1, false, false, 0.5, 0.28);

    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = 'rgba(94, 246, 231, 0.2)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(226, 255, 250, 0.75)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    ctx.restore();

    // A few lazy drifting sparks
    for (let i = 0; i < 3; i++) {
      const p = mod(t * 0.12 + i * 0.33, 1);
      ctx.fillStyle = 'rgba(255, 200, 120,' + (0.32 * (1 - p)).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(ax + 34 + Math.sin(t + i) * 14, ay + 22 + p * 58, 1.3, 0, TAU);
      ctx.fill();
    }

    const angle = Math.atan2(Math.cos(a), -Math.sin(a)) * 0.35;
    drawBird(bx, by, angle, wing, 0.8, 0.92, false);
  }

  // ---------------------------------------------------------------------------
  // Frame loop
  // ---------------------------------------------------------------------------

  function render() {
    ctx.setTransform(dpr * unit, 0, 0, dpr * unit, 0, 0);
    ctx.fillStyle = '#040716';
    ctx.fillRect(-40, -40, W + 80, WORLD_H + 80);

    const shake = game.shake;
    const sx = shake > 0.05 ? (Math.random() * 2 - 1) * shake : 0;
    const sy = shake > 0.05 ? (Math.random() * 2 - 1) * shake : 0;
    ctx.save();
    ctx.translate(sx, sy);
    drawBackground();
    if (game.state === 'menu') {
      drawMenuScene();
    } else {
      drawWorld();
    }
    ctx.restore();
  }

  let lastTime = 0;

  function frame(now) {
    if (!lastTime) lastTime = now;
    const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    game.time += dt;

    if (game.state === 'menu') {
      game.menuTime += dt;
      game.camera.x += 13 * dt;
      updateAmbient(dt);
    } else if (game.state === 'playing') {
      updateRun(dt);
      updateAmbient(dt);
    } else if (game.state === 'dying') {
      updateDeath(dt);
      updateAmbient(dt);
    } else if (game.state === 'dead') {
      updateDead(dt);
      updateAmbient(dt);
    }

    render();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------------------
  // Input & interface wiring
  // ---------------------------------------------------------------------------

  function pressInput() {
    if (game.state === 'playing') {
      input.holding = true;
      tryGrapple();
    }
  }

  function releaseInput() {
    input.holding = false;
    if (game.state === 'playing') releaseGrapple();
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (game.state !== 'playing') return;
    e.preventDefault();
    if (input.pointerId !== null) return;
    input.pointerId = e.pointerId;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) { /* noop */ }
    pressInput();
  }

  function onPointerUp(e) {
    if (input.pointerId !== null && e.pointerId !== input.pointerId) return;
    input.pointerId = null;
    releaseInput();
  }

  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  window.addEventListener('pointerup', onPointerUp, { passive: true });
  window.addEventListener('pointercancel', onPointerUp, { passive: true });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true, capture: true });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      if (e.repeat) return;
      if (game.state === 'menu' || game.state === 'dead') {
        startGame();
        return;
      }
      if (game.state === 'paused') {
        resumeGame();
        return;
      }
      if (game.state === 'playing') {
        if (input.pointerId === null) input.pointerId = -1;
        pressInput();
      }
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
      if (game.state === 'playing' || game.state === 'paused') {
        e.preventDefault();
        togglePause();
      }
    } else if (e.code === 'KeyM') {
      setMuted(!audio.muted);
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      if (input.pointerId === -1) input.pointerId = null;
      releaseInput();
    }
  });

  window.addEventListener('blur', () => {
    input.holding = false;
    input.pointerId = null;
    if (game.state === 'playing') pauseGame(true);
  });

  function wireButton(node, handler) {
    if (!node) return;
    node.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      audio.unlock();
      handler();
    });
  }

  wireButton(el.startBtn, () => { if (game.state === 'menu') startGame(); });
  wireButton(el.retryBtn, () => { if (game.state === 'dead') startGame(); });
  wireButton(el.menuBtn, () => goMenu());
  wireButton(el.pauseBtn, () => pauseGame(false));
  wireButton(el.resumeBtn, () => resumeGame());
  wireButton(el.pauseRestartBtn, () => { if (game.state === 'paused') startGame(); });
  wireButton(el.pauseMenuBtn, () => goMenu());
  wireButton(el.soundBtn, () => setMuted(!audio.muted));
  wireButton(el.menuSoundToggle, () => setMuted(!audio.muted));
  wireButton(el.pauseSoundToggle, () => setMuted(!audio.muted));
  wireButton(el.tiltToggle, () => toggleTilt());
  wireButton(el.pauseTiltToggle, () => toggleTilt());
  wireButton(el.invertToggle, () => {
    motion.invert = !motion.invert;
    writeSave('skyhook.invert.v1', motion.invert);
    updateTiltUI();
    audio.play('ui');
  });

  // ---------------------------------------------------------------------------
  // Resize & lifecycle
  // ---------------------------------------------------------------------------

  let resizeTimer = 0;

  function handleResize() {
    layout();
    if (game.state === 'playing' || game.state === 'paused' || game.state === 'dying') {
      game.camera.x = bird.x - W * 0.30;
      ensureWorld();
    }
  }

  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(handleResize, 80);
  });

  window.addEventListener('orientationchange', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(handleResize, 220);
    if (motion.enabled) {
      motion.calibrated = false;
      motion.samples = [];
      motion.neutral = 0;
      motion.tilt = 0;
      updateTiltUI();
    }
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(handleResize, 100);
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      releaseWakeLock();
      if (game.state === 'playing') pauseGame(true);
    } else if (game.state === 'playing') {
      requestWakeLock();
    }
  });

  window.addEventListener('pagehide', releaseWakeLock);

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------

  layout();
  refreshBest();
  syncSoundUI();
  updateTiltUI();
  setState('menu');
  game.camera.x = 0;
  requestAnimationFrame(frame);

  // A small, read-mostly handle for automated visual checks.
  window.__skyhook = {
    start: startGame,
    press: pressInput,
    release: releaseInput,
    pause: () => pauseGame(false),
    resume: resumeGame,
    menu: goMenu,
    snapshot: () => ({
      state: game.state,
      score: game.score,
      best: game.best,
      bird: { x: bird.x, y: bird.y, vx: bird.vx, vy: bird.vy, attached: !!bird.attached, ropeLen: bird.ropeLen },
      attach: bird.attached ? { x: bird.attached.x, y: bird.attached.y } : null,
      camera: game.camera.x,
      reason: game.reason,
      pipes: game.pipes.map(p => ({ x: p.x, gapY: p.gapY, gap: p.gap })),
      anchors: game.anchors.map(a => ({ x: a.x, y: a.y }))
    })
  };
})();
