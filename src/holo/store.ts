import { tracks } from "./tracks";

export const rig = { rotY: 0, targetRotY: 0 };
export const player = { focusIndex: 0, playingIndex: -1 };
export const N = tracks.length;
export const STEP = (Math.PI * 2) / N;

export function wrap(a: number) {
  const t = (a + Math.PI) % (Math.PI * 2);
  return (t < 0 ? t + Math.PI * 2 : t) - Math.PI;
}

/** Rotate the 3D carousel so that track `idx` comes to the front. */
export function seekCarousel(idx: number) {
  // Each card sits at angle (i / N) * 2π.  We negate it so that card rotates
  // into the "front" position (angle = 0 in camera space).
  rig.targetRotY = -(idx / N) * Math.PI * 2;
}

