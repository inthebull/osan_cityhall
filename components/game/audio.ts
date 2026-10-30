let ctx: AudioContext | null = null;

export function unlockAudio() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  amp.gain.setValueAtTime(gain, t0);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  step() {
    tone(160 + Math.random() * 30, 0.04, "square", 0.015);
  },
  talk() {
    tone(523, 0.07, "square", 0.03);
    tone(784, 0.09, "square", 0.03, 0.06);
  },
  floor() {
    tone(330, 0.1, "triangle", 0.04);
    tone(494, 0.14, "triangle", 0.04, 0.08);
  },
  stamp() {
    tone(659, 0.08, "square", 0.035);
    tone(880, 0.12, "square", 0.035, 0.08);
  },
  ping() {
    tone(440, 0.06, "square", 0.03);
    tone(554, 0.06, "square", 0.03, 0.07);
    tone(659, 0.12, "square", 0.03, 0.14);
  },
};
