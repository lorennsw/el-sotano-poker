// Sonidos sintetizados con Web Audio (sin archivos): carta, fichas, turno y victoria.

let ctx = null;
let muted = false;
try {
  muted = localStorage.getItem('sotano.muted') === '1';
} catch {}

function ac() {
  if (muted) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(m) {
  muted = m;
  try {
    localStorage.setItem('sotano.muted', m ? '1' : '0');
  } catch {}
}

function noiseBurst(a, t, dur, freq, gain) {
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 0.9;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

function ping(a, t, freq, dur, gain, type = 'sine') {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  card(delay = 0) {
    const a = ac();
    if (!a) return;
    noiseBurst(a, a.currentTime + delay, 0.07, 2600 + Math.random() * 800, 0.5);
  },
  flip() {
    const a = ac();
    if (!a) return;
    noiseBurst(a, a.currentTime, 0.05, 1800, 0.35);
  },
  chips() {
    const a = ac();
    if (!a) return;
    const t = a.currentTime;
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.045 + Math.random() * 0.02;
      ping(a, tt, 3200 + Math.random() * 1400, 0.09, 0.08, 'triangle');
      noiseBurst(a, tt, 0.03, 5000, 0.12);
    }
  },
  turn() {
    const a = ac();
    if (!a) return;
    const t = a.currentTime;
    ping(a, t, 880, 0.25, 0.08);
    ping(a, t + 0.12, 1320, 0.35, 0.07);
  },
  win() {
    const a = ac();
    if (!a) return;
    const t = a.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => ping(a, t + i * 0.09, f, 0.5, 0.08, 'triangle'));
  },
  lose() {
    const a = ac();
    if (!a) return;
    const t = a.currentTime;
    ping(a, t, 330, 0.35, 0.06, 'sine');
    ping(a, t + 0.15, 247, 0.5, 0.06, 'sine');
  },
};
