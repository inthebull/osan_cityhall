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

// 게임 효과음 대신 앱 알림처럼 짧고 부드러운 사인파만 쓴다.
export const sfx = {
  step() {
    tone(220, 0.03, "sine", 0.006);
  },
  talk() {
    tone(880, 0.08, "sine", 0.025);
  },
  floor() {
    tone(523, 0.12, "sine", 0.025);
    tone(784, 0.16, "sine", 0.02, 0.09);
  },
  stamp() {
    tone(660, 0.1, "sine", 0.025);
    tone(990, 0.14, "sine", 0.02, 0.08);
  },
  ping() {
    tone(587, 0.08, "sine", 0.025);
    tone(880, 0.12, "sine", 0.02, 0.08);
  },
};
