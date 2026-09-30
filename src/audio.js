// Tiny synthesiser for sound effects, so the game needs no audio files.
// Browsers (especially iPhone Safari) only allow sound after the player
// touches the screen or presses a key, so call unlockAudio() from an input
// handler before anything plays.

let ctx = null;
let master = null;
let muted = false;
let noiseBuffer = null;

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.6;
    master.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function setMuted(value) {
  muted = value;
  if (master) master.gain.value = muted ? 0 : 0.6;
}

function ready() {
  return ctx && ctx.state === 'running' && !muted;
}

function tone({ type = 'square', f0, f1 = f0, dur = 0.1, vol = 0.15, delay = 0 }) {
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise({ dur = 0.3, vol = 0.3, freq = 1000, freqEnd = freq, type = 'lowpass', delay = 0 }) {
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(gain).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export const sfx = {
  hop() {
    if (!ready()) return;
    tone({ type: 'square', f0: 380, f1: 720, dur: 0.07, vol: 0.06 });
  },
  bump() {
    if (!ready()) return;
    tone({ type: 'triangle', f0: 180, f1: 120, dur: 0.08, vol: 0.12 });
  },
  coin() {
    if (!ready()) return;
    tone({ type: 'square', f0: 988, dur: 0.07, vol: 0.07 });
    tone({ type: 'square', f0: 1319, dur: 0.18, vol: 0.07, delay: 0.07 });
  },
  squash() {
    if (!ready()) return;
    noise({ dur: 0.25, vol: 0.5, freq: 1800, freqEnd: 200 });
    tone({ type: 'sawtooth', f0: 220, f1: 50, dur: 0.3, vol: 0.18 });
  },
  crash() {
    if (!ready()) return;
    noise({ dur: 0.6, vol: 0.6, freq: 3000, freqEnd: 150 });
    tone({ type: 'sawtooth', f0: 160, f1: 40, dur: 0.5, vol: 0.2 });
  },
  splash() {
    if (!ready()) return;
    noise({ dur: 0.5, vol: 0.45, freq: 400, freqEnd: 3000, type: 'bandpass' });
    tone({ type: 'sine', f0: 600, f1: 120, dur: 0.25, vol: 0.15 });
  },
  bell() {
    if (!ready()) return;
    for (let i = 0; i < 4; i++) {
      tone({ type: 'triangle', f0: 1480, f1: 1400, dur: 0.16, vol: 0.12, delay: i * 0.33 });
    }
  },
  horn() {
    if (!ready()) return;
    tone({ type: 'sawtooth', f0: 311, dur: 0.7, vol: 0.08 });
    tone({ type: 'sawtooth', f0: 392, dur: 0.7, vol: 0.06 });
    noise({ dur: 1.2, vol: 0.25, freq: 900, freqEnd: 300 });
  },
  eagle() {
    if (!ready()) return;
    tone({ type: 'sawtooth', f0: 2200, f1: 900, dur: 0.45, vol: 0.1 });
    tone({ type: 'square', f0: 1800, f1: 700, dur: 0.4, vol: 0.05, delay: 0.05 });
  },
  click() {
    if (!ready()) return;
    tone({ type: 'square', f0: 660, f1: 880, dur: 0.05, vol: 0.05 });
  },
  unlock() {
    if (!ready()) return;
    [523, 659, 784, 1047].forEach((f, i) =>
      tone({ type: 'square', f0: f, dur: 0.14, vol: 0.07, delay: i * 0.09 }),
    );
  },
};
