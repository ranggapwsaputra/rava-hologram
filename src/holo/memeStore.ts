// memeStore.ts — Global mutable state for the 3D Meme Gallery
export interface Meme { url: string; title: string; subreddit: string; }

export const memeStore = {
  memes: [] as Meme[],
  loading: false,
};

const subs = new Set<() => void>();
export const memeEvents = {
  emit: () => subs.forEach(f => f()),
  sub:  (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
};

// Mutable rig state read inside useFrame — no React re-renders needed
export const memeRig = {
  rotY:       0,
  targetRotY: 0,
  hovering:   -1,
  _bestDist:  9999, // reset each frame by Controller
};
