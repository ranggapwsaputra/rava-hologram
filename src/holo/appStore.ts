// App-shell router + the "throw to close" effect state.
export type View = "home" | "music" | "robot" | "meme" | "gesturefx" | "chordlab" | "news";

let _view: View = "home";
const subs = new Set<() => void>();

export const appView = {
  get: () => _view,
  set: (v: View) => { _view = v; subs.forEach((f) => f()); },
  sub: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
};

// throw-to-close animation state (read inside the R3F loop for Music/Home)
export const fx = { closing: false, t0: 0 };
export function startThrow() { if (!fx.closing) { fx.closing = true; fx.t0 = performance.now(); } }
export function endThrow() { fx.closing = false; }
