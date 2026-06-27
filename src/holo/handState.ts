// Mutable singletons written by MediaPipe, read inside render loops.
export const hand = {
  present: false,
  x: 0.5, y: 0.5,
  vx: 0, vy: 0,
  point: false,         // index-finger pointing — select / play
  grab: false,          // closed fist — hold to exit
  open: false,          // open palm — enter from loading
  pinch: false,         // thumb + index tips together — grab & spin the carousel
  pinchDist: 1,         // normalized distance between thumb/index tips (for grab hysteresis)
  landmarks: null as any, // raw 21 landmarks for the neon hand FX
};

// raw landmark sets for every hand MediaPipe sees this frame (up to 2) — consumed by the Gesture FX rig.
export const multiHand = { list: [] as any[] };

// shared UI state
export const ui = {
  exitProgress: 0,  // 0..1 fist-hold-to-exit progress (drives the cursor ring)
  pointProgress: 0, // 0..1 point-and-hold-to-open progress (deliberate select, anti-misfire)
};
