// ravaVoice.ts — Centralized TTS for R.A.V.A with male robot voice selection.
// All components import speak() from here for consistent personality.

/**
 * Pick the best available male voice.
 * Priority: Indonesian male → English male → any male → any voice.
 */
function pickVoice(): SpeechSynthesisVoice | null {
  const all = window.speechSynthesis?.getVoices() ?? [];
  if (!all.length) return null;

  const isId   = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().startsWith("id");
  const isEn   = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().startsWith("en");
  const isMale = (v: SpeechSynthesisVoice) => {
    const n = v.name.toLowerCase();
    // Common male voice identifiers across Windows / macOS / Android / Chrome TTS
    return /\b(male|man|david|mark|james|thomas|daniel|evan|aaron|fred|alex|google uk english male|google us english|microsoft david|microsoft zira|andika|arief|aria)\b/.test(n)
      && !/female|woman|zira|hazel|victoria|karen|tessa|moira|fiona|ava|samantha|siri/i.test(n);
  };

  return (
    all.find(v => isId(v) && isMale(v))  ||   // 1. Indonesian male
    all.find(v => isId(v))               ||   // 2. Any Indonesian
    all.find(v => isEn(v) && isMale(v))  ||   // 3. English male
    all.find(v => isMale(v))             ||   // 4. Any male
    all[0]                                    // 5. Fallback: first voice
  );
}

/**
 * Speak text with a robotic male voice.
 * @param text     Text to speak.
 * @param onEnd    Optional callback after speech ends.
 * @param opts     Override pitch / rate (default: low pitch, slight slowdown for robot feel).
 */
export function speak(
  text: string,
  onEnd?: () => void,
  opts: { pitch?: number; rate?: number } = {}
) {
  if (!window.speechSynthesis) { onEnd?.(); return; }
  window.speechSynthesis.cancel();

  const u = new SpeechSynthesisUtterance(text);
  u.lang  = "id-ID";
  u.pitch = opts.pitch ?? 0.72;   // Lower than 1 = deeper, robotic
  u.rate  = opts.rate  ?? 0.92;   // Slightly slower for clarity

  // Voices may not be loaded yet on first call — retry once after a short delay.
  const trySpeak = () => {
    const voice = pickVoice();
    if (voice) u.voice = voice;
    u.onend  = () => onEnd?.();
    u.onerror = () => onEnd?.();
    window.speechSynthesis.speak(u);
  };

  if (window.speechSynthesis.getVoices().length === 0) {
    // Voices not yet loaded; wait for them
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      trySpeak();
    };
  } else {
    trySpeak();
  }
}
