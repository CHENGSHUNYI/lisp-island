// 背景音樂與音效：全部用 Web Audio 即時合成的原創旋律，不需要音樂檔。
// 瀏覽器規定要使用者互動後才能發聲，所以第一次點擊／按鍵後才開始播放。
window.LispAudio = (() => {
  const KEY = "lispSound";
  let enabled = localStorage.getItem(KEY) !== "off";
  // 音量（0–100），存在瀏覽器
  const vol = { music: 50, sfx: 80 };
  let ducked = false;
  try { Object.assign(vol, JSON.parse(localStorage.getItem("lispVolume") || "{}")); } catch {}
  const musicGain = () => 0.62 * Math.pow(vol.music / 100, 2);
  const sfxGain = () => 1.1 * Math.pow(vol.sfx / 100, 2);
  let ctx = null, master, musicBus, sfxBus, ambBus, noiseBuf;
  let theme = "ghibli", timer = null, step = 0, nextTime = 0, song = null, ambient = [];
  const listeners = [];

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const rnd = (s) => { const x = Math.sin(s * 127.1) * 43758.5453; return x - Math.floor(x); };

  // ---------- 各情境的曲風 ----------
  // steps：每小節幾格（8 分音符）；prog：每小節和弦根音（相對主音的半音）與大小調
  const SONGS = {
    ghibli: { bpm: 88, steps: 6, key: 60, scale: [0, 2, 4, 5, 7, 9, 11], prog: [[0, 1], [9, 0], [5, 1], [7, 1], [0, 1], [4, 0], [5, 1], [7, 1]],
      lead: "piano", bass: "soft", chord: "pad", drums: null, amb: "breeze", density: 0.55 },
    jungle: { bpm: 104, steps: 8, key: 57, scale: [0, 3, 5, 7, 10], prog: [[0, 0], [-2, 1], [-4, 1], [-2, 1]],
      lead: "marimba", bass: "marimbaLow", chord: null, drums: "jungle", amb: "insects", density: 0.6 },
    ocean: { bpm: 76, steps: 8, key: 65, scale: [0, 2, 4, 7, 9], prog: [[0, 1], [5, 1], [9, 0], [7, 1]],
      lead: "bell", bass: "soft", chord: "pad", drums: "shaker", amb: "waves", density: 0.42 },
    zoo: { bpm: 124, steps: 8, key: 67, scale: [0, 2, 4, 5, 7, 9, 11], prog: [[0, 1], [5, 1], [7, 1], [0, 1]],
      lead: "xylo", bass: "tuba", chord: "stab", drums: "wood", amb: null, density: 0.62 },
    safari: { bpm: 96, steps: 8, key: 62, scale: [0, 2, 4, 7, 9], prog: [[0, 1], [5, 1], [7, 1], [5, 1]],
      lead: "kalimba", bass: "drone", chord: null, drums: "djembe", amb: "wind", density: 0.58 },
  };

  // 依主題產生固定的 8 小節旋律（每次相同，聽起來像一首曲子）
  function compose(id) {
    const S = SONGS[id], bars = 8, mel = [];
    let deg = 2;
    for (let b = 0; b < bars; b++) {
      const [root, maj] = S.prog[b % S.prog.length];
      const chordTones = [root, root + (maj ? 4 : 3), root + 7];
      for (let s = 0; s < S.steps; s++) {
        const strong = s === 0 || (S.steps === 8 && s === 4) || (S.steps === 6 && s === 3);
        const seed = id.length * 31 + b * 13 + s * 7;
        const play = strong ? rnd(seed) < 0.9 : rnd(seed) < S.density * 0.75;
        if (!play) { mel.push(null); continue; }
        let note;
        if (strong) {
          const ct = chordTones[Math.floor(rnd(seed + 1) * 3)];
          note = S.key + 12 + ((ct % 12) + 12) % 12;
          deg = S.scale.indexOf(((ct % 12) + 12) % 12); if (deg < 0) deg = 0;
        } else {
          deg += rnd(seed + 2) < 0.5 ? -1 : 1;
          if (rnd(seed + 3) < 0.2) deg += rnd(seed + 4) < 0.5 ? -1 : 1;
          deg = Math.max(0, Math.min(S.scale.length * 2 - 1, deg));
          note = S.key + 12 + S.scale[deg % S.scale.length] + 12 * Math.floor(deg / S.scale.length);
        }
        const len = strong && rnd(seed + 5) < 0.4 ? 2 : 1;
        mel.push({ note, len });
      }
    }
    return { S, mel, bars };
  }

  // ---------- 聲音零件 ----------
  function env(g, t, a, peak, d, sustain = 0) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain || 0.0001), t + a + d);
  }
  function osc(type, freq, t, dur, peak, dest, { a = 0.005, detune = 0, glideTo = null, filter = null, q = 1 } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur * 0.8);
    let node = o;
    if (filter) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = filter; f.Q.value = q; o.connect(f); node = f; }
    node.connect(g); g.connect(dest);
    env(g, t, a, peak, dur);
    o.start(t); o.stop(t + a + dur + 0.05);
    return o;
  }
  function noise(t, dur, peak, dest, type = "bandpass", freq = 2000, q = 1, a = 0.002) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    s.connect(f); f.connect(g); g.connect(dest);
    env(g, t, a, peak, dur);
    s.start(t, Math.random() * 1.5); s.stop(t + a + dur + 0.05);
  }
  function drum(freq, t, peak, dest, end = 50, dur = 0.25) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(end, t + dur);
    o.connect(g); g.connect(dest); env(g, t, 0.003, peak, dur);
    o.start(t); o.stop(t + dur + 0.05);
  }
  // 樂器
  const INST = {
    piano: (f, t, d, v, out) => { osc("triangle", f, t, 1.4, 0.22 * v, out); osc("sine", f * 2, t, 0.6, 0.06 * v, out); },
    marimba: (f, t, d, v, out) => { osc("sine", f, t, 0.45, 0.3 * v, out); osc("sine", f * 4, t, 0.08, 0.08 * v, out); },
    marimbaLow: (f, t, d, v, out) => { osc("sine", f / 2, t, 0.6, 0.32 * v, out); osc("sine", f * 2, t, 0.06, 0.05 * v, out); },
    bell: (f, t, d, v, out) => { osc("sine", f, t, 1.8, 0.16 * v, out); osc("sine", f * 2.76, t, 0.7, 0.05 * v, out); osc("sine", f * 5.4, t, 0.25, 0.02 * v, out); },
    xylo: (f, t, d, v, out) => { osc("sine", f * 2, t, 0.28, 0.22 * v, out); osc("triangle", f * 4, t, 0.05, 0.05 * v, out); },
    kalimba: (f, t, d, v, out) => { osc("sine", f, t, 0.9, 0.24 * v, out, { a: 0.002 }); osc("sine", f * 5.1, t, 0.12, 0.05 * v, out); },
    soft: (f, t, d, v, out) => osc("sine", f / 2, t, d * 0.95, 0.22 * v, out, { a: 0.03 }),
    tuba: (f, t, d, v, out) => osc("sawtooth", f / 2, t, Math.min(0.35, d), 0.18 * v, out, { a: 0.02, filter: 500, q: 2 }),
    drone: (f, t, d, v, out) => { osc("sine", f / 2, t, d, 0.14 * v, out, { a: 0.4 }); osc("sine", f * 0.75, t, d, 0.05 * v, out, { a: 0.6 }); },
    pad: (f, t, d, v, out) => { for (const det of [-6, 6]) osc("sine", f, t, d, 0.05 * v, out, { a: 0.5, detune: det }); },
    stab: (f, t, d, v, out) => osc("square", f, t, 0.09, 0.035 * v, out, { filter: 1800 }),
  };

  // ---------- 排程器 ----------
  function schedule() {
    const spb = 60 / song.S.bpm / 2;            // 每格（8 分音符）秒數
    while (nextTime < ctx.currentTime + 0.25) {
      const S = song.S, steps = S.steps, bar = Math.floor(step / steps) % song.bars, s = step % steps;
      const [root, maj] = S.prog[bar % S.prog.length];
      const t = nextTime, loop = Math.floor(step / (steps * song.bars));
      // 旋律（第 2 輪起偶爾升高八度、留白）
      const m = song.mel[bar * steps + s];
      if (m && !(loop % 2 === 1 && rnd(step) < 0.12)) INST[S.lead](mtof(m.note + (loop % 3 === 2 && rnd(step + 9) < 0.3 ? 12 : 0)), t, spb * m.len, 1, musicBus);
      // 低音
      const bassNote = S.key - 12 + root;
      if (S.bass === "tuba") { if (s === 0) INST.tuba(mtof(bassNote), t, spb * 2, 1, musicBus); if (s === 4) INST.tuba(mtof(bassNote + 7), t, spb * 2, 1, musicBus); }
      else if (S.bass === "drone") { if (s === 0) INST.drone(mtof(bassNote), t, spb * steps, 1, musicBus); }
      else if (S.bass === "marimbaLow") { if (s === 0 || s === 3 || s === 6) INST.marimbaLow(mtof(bassNote + (s === 3 ? 7 : 0)), t, spb, 1, musicBus); }
      else if (S.bass && s === 0) INST[S.bass](mtof(bassNote), t, spb * steps, 1, musicBus);
      // 和弦
      const chord = [0, maj ? 4 : 3, 7].map((x) => S.key + root + x);
      if (S.chord === "pad" && s === 0) chord.forEach((n) => INST.pad(mtof(n), t, spb * steps, 1, musicBus));
      if (S.chord === "stab" && (s === 2 || s === 6)) chord.forEach((n) => INST.stab(mtof(n + 12), t, spb, 1, musicBus));
      if (S.steps === 6 && S.chord === "pad" && (s === 2 || s === 4)) chord.slice(1).forEach((n) => INST.piano(mtof(n), t, spb, 0.35, musicBus));
      // 鼓
      if (S.drums === "jungle") {
        if (s === 0 || s === 5) drum(110, t, 0.5, musicBus, 55, 0.3);
        if (s === 2 || s === 6) drum(220, t, 0.28, musicBus, 140, 0.15);
        noise(t, 0.04, s % 2 ? 0.05 : 0.08, musicBus, "highpass", 6000);
      } else if (S.drums === "djembe") {
        if (s === 0 || s === 3 || s === 6) drum(95, t, 0.45, musicBus, 50, 0.28);
        if (s === 2 || s === 5 || s === 7) { drum(300, t, 0.18, musicBus, 200, 0.08); noise(t, 0.05, 0.08, musicBus, "bandpass", 1800, 2); }
        if (s % 2 === 1) noise(t, 0.03, 0.04, musicBus, "highpass", 7000);
      } else if (S.drums === "shaker") {
        noise(t, 0.08, s % 2 ? 0.025 : 0.045, musicBus, "highpass", 6500);
      } else if (S.drums === "wood") {
        if (s % 2 === 0) drum(900, t, 0.12, musicBus, 800, 0.04);
        if (s === 4) noise(t, 0.08, 0.06, musicBus, "bandpass", 2500, 1.5);
      }
      nextTime += spb; step++;
    }
  }

  // ---------- 環境音 ----------
  function stopAmbient() { ambient.forEach((n) => { try { n.stop(); } catch {} }); ambient = []; }
  function startAmbient(kind) {
    stopAmbient();
    if (!kind) return;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    if (kind === "waves") { f.type = "lowpass"; f.frequency.value = 700; g.gain.value = 0.16; lfo.frequency.value = 0.11; lg.gain.value = 0.12; }
    if (kind === "wind" || kind === "breeze") { f.type = "bandpass"; f.frequency.value = kind === "wind" ? 500 : 900; f.Q.value = 0.6; g.gain.value = kind === "wind" ? 0.08 : 0.035; lfo.frequency.value = 0.07; lg.gain.value = 0.05; }
    if (kind === "insects") { f.type = "bandpass"; f.frequency.value = 5200; f.Q.value = 8; g.gain.value = 0.03; lfo.frequency.value = 7; lg.gain.value = 0.025; }
    lfo.connect(lg); lg.connect(g.gain);
    s.connect(f); f.connect(g); g.connect(ambBus);
    s.start(); lfo.start();
    ambient.push(s, lfo);
  }
  // 偶爾的鳥叫
  let birdTimer = null;
  function birds() {
    clearTimeout(birdTimer);
    if (!ctx || !enabled) return;
    if (theme === "jungle" || theme === "safari" || theme === "ghibli") {
      const t = ctx.currentTime + 0.05, base = theme === "jungle" ? 2400 : 1800;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) osc("sine", base + Math.random() * 600, t + i * 0.13, 0.09, 0.035, ambBus, { glideTo: base * 1.5 });
    } else if (theme === "ocean") {
      const t = ctx.currentTime + 0.05;
      osc("sine", 1300, t, 0.25, 0.03, ambBus, { glideTo: 900 }); osc("sine", 1250, t + 0.3, 0.2, 0.025, ambBus, { glideTo: 850 });
    }
    birdTimer = setTimeout(birds, 4000 + Math.random() * 7000);
  }

  // ---------- 音效 ----------
  const CALL = {
    ghibli: (t) => { [0, 4, 7, 12].forEach((x, i) => INST.bell(mtof(72 + x), t + i * 0.07, 0.4, 1.1, sfxBus)); },
    jungle: (t) => { for (let i = 0; i < 3; i++) osc("sine", 1800, t + i * 0.1, 0.08, 0.18, sfxBus, { glideTo: 3200 }); },
    ocean: (t) => { const o = osc("sine", 1400, t, 0.35, 0.16, sfxBus, { glideTo: 2600 }); const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 28; lg.gain.value = 120; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + 0.4); },
    zoo: (t) => { osc("sawtooth", 330, t, 0.35, 0.12, sfxBus, { glideTo: 520, filter: 1600, q: 3, a: 0.03 }); osc("sawtooth", 333, t, 0.35, 0.08, sfxBus, { glideTo: 525, filter: 1400, q: 3, a: 0.03 }); },
    safari: (t) => { osc("sawtooth", 140, t, 0.5, 0.16, sfxBus, { glideTo: 80, filter: 420, q: 4, a: 0.05 }); noise(t, 0.5, 0.08, sfxBus, "lowpass", 500, 1, 0.05); },
  };
  const SFX = {
    click: (t) => noise(t, 0.03, 0.12, sfxBus, "highpass", 3500),
    pop: (t) => osc("sine", 520, t, 0.12, 0.22, sfxBus, { glideTo: 1100 }),
    open: (t) => { const k = SONGS[theme].key + 12; [0, 4, 7].forEach((x, i) => INST.kalimba(mtof(k + x), t + i * 0.06, 0.3, 1.2, sfxBus)); CALL[theme](t + 0.2); },
    close: (t) => { const k = SONGS[theme].key + 12; [7, 0].forEach((x, i) => INST.marimba(mtof(k + x), t + i * 0.08, 0.3, 1.1, sfxBus)); },
    coin: (t) => { osc("square", mtof(83), t, 0.07, 0.07, sfxBus, { filter: 4000 }); osc("square", mtof(88), t + 0.07, 0.25, 0.07, sfxBus, { filter: 4000 }); },
    switch: (t) => { const k = SONGS[theme].key + 12; SONGS[theme].scale.concat([12]).forEach((x, i) => INST.xylo(mtof(k + x - 12), t + i * 0.045, 0.2, 0.9, sfxBus)); },
    call: (t) => CALL[theme](t),
  };
  let lastCall = 0;
  function sfx(name) {
    if (!ctx || !enabled || !SFX[name]) return;
    if (name === "call") { const n = performance.now(); if (n - lastCall < 700) return; lastCall = n; }
    SFX[name](ctx.currentTime + 0.01);
  }

  // ---------- 控制 ----------
  function start() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      master = ctx.createGain(); master.gain.value = 0.9;
      musicBus = ctx.createGain(); musicBus.gain.value = musicGain();
      sfxBus = ctx.createGain(); sfxBus.gain.value = sfxGain();
      ambBus = ctx.createGain(); ambBus.gain.value = 2.5 * musicGain();
      musicBus.connect(master); sfxBus.connect(master); ambBus.connect(master);
      master.connect(comp); comp.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume();
    playTheme(theme);
  }
  function playTheme(id) {
    theme = SONGS[id] ? id : "ghibli";
    if (!ctx || !enabled) return;
    song = compose(theme); step = 0; nextTime = ctx.currentTime + 0.1;
    clearInterval(timer); timer = setInterval(schedule, 60);
    startAmbient(song.S.amb);
    birds();
  }
  function stop() {
    clearInterval(timer); timer = null; stopAmbient(); clearTimeout(birdTimer);
    if (ctx) ctx.suspend();
  }
  function setEnabled(on) {
    enabled = on;
    localStorage.setItem(KEY, on ? "on" : "off");
    if (on) start(); else stop();
    listeners.forEach((f) => f(on));
  }

  // 第一次互動後開始
  const kick = () => {
    window.removeEventListener("pointerdown", kick, true);
    window.removeEventListener("keydown", kick, true);
    if (enabled) start();
  };
  window.addEventListener("pointerdown", kick, true);
  window.addEventListener("keydown", kick, true);
  document.addEventListener("visibilitychange", () => {
    if (!ctx || !enabled) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });

  return {
    get enabled() { return enabled; },
    get state() { return ctx ? ctx.state : "idle"; },
    get volume() { return { ...vol }; },
    // 播放教學影片時暫時把背景音樂降到無聲
    duck(on) {
      ducked = !!on;
      if (!ctx) return;
      const t = ctx.currentTime;
      musicBus.gain.setTargetAtTime(ducked ? 0 : musicGain(), t, 0.15);
      ambBus.gain.setTargetAtTime(ducked ? 0 : 2.5 * musicGain(), t, 0.15);
    },
    setVolume(kind, v) {
      if (!(kind in vol)) return;
      vol[kind] = Math.max(0, Math.min(100, Math.round(v)));
      localStorage.setItem("lispVolume", JSON.stringify(vol));
      if (ctx) {
        const t = ctx.currentTime;
        musicBus.gain.setTargetAtTime(ducked ? 0 : musicGain(), t, 0.05);
        ambBus.gain.setTargetAtTime(ducked ? 0 : 2.5 * musicGain(), t, 0.05);
        sfxBus.gain.setTargetAtTime(sfxGain(), t, 0.02);
      }
    },
    toggle() { setEnabled(!enabled); if (enabled) sfx("pop"); },
    setTheme(id) { theme = SONGS[id] ? id : "ghibli"; if (ctx && enabled) { playTheme(theme); sfx("switch"); } },
    sfx,
    onChange(f) { listeners.push(f); },
  };
})();
