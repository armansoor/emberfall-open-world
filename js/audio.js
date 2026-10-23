'use strict';
/* Emberfall — tiny WebAudio sound engine (no audio files needed). */
const EmberAudio = (() => {
  let ctx = null, enabled = true;
  function ensure() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function beep(freq, dur, type, vol, slide) {
    if (!enabled) return;
    const c = ensure(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(freq, c.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), c.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.06, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + dur);
  }
  return {
    toggle() { enabled = !enabled; return enabled; },
    isEnabled() { return enabled; },
    setEnabled(v) { enabled = !!v; },
    attack() { beep(320, 0.09, 'square', 0.05, 140); },
    shoot() { beep(760, 0.11, 'sawtooth', 0.045, 220); },
    hit() { beep(140, 0.1, 'square', 0.06, 70); },
    hurt() { beep(200, 0.16, 'sawtooth', 0.07, 60); },
    coin() { beep(950, 0.07, 'square', 0.05); setTimeout(() => beep(1350, 0.12, 'square', 0.05), 60); },
    pickup() { beep(620, 0.09, 'triangle', 0.07); setTimeout(() => beep(930, 0.14, 'triangle', 0.07), 80); },
    potion() { beep(420, 0.2, 'sine', 0.08, 840); },
    levelup() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.16, 'triangle', 0.07), i * 90)); },
    quest() { [392, 523, 659].forEach((f, i) => setTimeout(() => beep(f, 0.15, 'triangle', 0.06), i * 80)); },
    boss() { beep(98, 0.6, 'sawtooth', 0.09, 49); },
    die() { beep(392, 0.7, 'triangle', 0.07, 55); }
  };
})();
if (typeof window !== 'undefined') window.EmberAudio = EmberAudio;
