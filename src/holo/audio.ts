// Real audio playback via a single <audio> element (loops the selected track).
let el: HTMLAudioElement | null = null;

function ensureEl() {
  if (!el) {
    el = new Audio();
    el.loop = true;
    el.volume = 0.95;
    el.preload = "auto";
  }
  return el;
}

// Called on the enter gesture: a play()/pause() unlocks autoplay. (Do NOT call this from toggle/play —
// it leaves the element paused, which would defeat pause detection.)
export function resumeAudio() {
  const a = ensureEl();
  a.play().catch(() => {});
  a.pause();
}

export function playTrack(src: string) {
  const a = ensureEl();
  const abs = new URL(src, location.href).href;
  if (a.src === abs) { if (a.paused) a.play().catch(() => {}); return; } // same track → resume
  a.src = src;
  a.currentTime = 0;
  a.play().catch(() => {});
}

// pause/resume the same track, or switch to a new one. Used by "point at the playing track again to pause".
export function toggleTrack(src: string) {
  const a = ensureEl();
  const abs = new URL(src, location.href).href;
  if (a.src === abs) { a.paused ? a.play().catch(() => {}) : a.pause(); return; }
  a.src = src;
  a.currentTime = 0;
  a.play().catch(() => {});
}

export function pauseTrack() { if (el && !el.paused) el.pause(); }

export function isPlaying() {
  return !!el && !el.paused;
}
