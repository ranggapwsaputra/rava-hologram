// JARVIS-style power-on + UI blips, synthesized in-browser (no audio files).
let ctx: AudioContext | null = null;
function ac() {
  if (!ctx) { const AC = (window as any).AudioContext || (window as any).webkitAudioContext; ctx = new AC(); }
  if (ctx!.state === "suspended") ctx!.resume();
  return ctx!;
}

export function powerOn() {
  const c = ac(), t = c.currentTime;
  // rising power sweep
  const o = c.createOscillator(); o.type = "sawtooth";
  o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(880, t + 1.3);
  const f = c.createBiquadFilter(); f.type = "lowpass";
  f.frequency.setValueAtTime(280, t); f.frequency.exponentialRampToValueAtTime(4200, t + 1.3);
  const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.3); g.gain.linearRampToValueAtTime(0.0001, t + 1.8);
  o.connect(f); f.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 1.9);
  // high shimmer
  const o2 = c.createOscillator(); o2.type = "sine";
  o2.frequency.setValueAtTime(1300, t); o2.frequency.exponentialRampToValueAtTime(2600, t + 1.1);
  const g2 = c.createGain(); g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(0.05, t + 0.5); g2.gain.linearRampToValueAtTime(0.0001, t + 1.5);
  o2.connect(g2); g2.connect(c.destination); o2.start(t); o2.stop(t + 1.6);
}

export function blip(freq = 820) {
  const c = ac(), t = c.currentTime;
  const o = c.createOscillator(); o.type = "sine"; o.frequency.value = freq;
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.1, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.18);
}
