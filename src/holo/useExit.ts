import { useEffect, useRef, useState } from "react";
import { hand, ui } from "./handState";
import { appView } from "./appStore";

// Hold a fist ~0.85s to run onExit (fills the cursor ring via ui.exitProgress).
export function useFistExit(onExit: () => void) {
  const ref = useRef(onExit); ref.current = onExit;
  useEffect(() => {
    let raf = 0, held = 0, last = performance.now(), fired = false;
    const HOLD = 0.85;
    const loop = () => {
      const now = performance.now(), dt = (now - last) / 1000; last = now;
      if (hand.present && hand.grab) {
        held += dt; ui.exitProgress = Math.min(1, held / HOLD);
        if (held >= HOLD && !fired) { fired = true; ui.exitProgress = 0; ref.current(); }
      } else { held = 0; fired = false; ui.exitProgress = 0; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ui.exitProgress = 0; };
  }, []);
}

// Throw your hand UP → exit the current app back to Home (with a brief leave animation).
export function useExit() {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    let raf = 0, done = false;
    const loop = () => {
      if (!done && hand.present && hand.vy < -0.05 && Math.abs(hand.vy) > Math.abs(hand.vx) * 1.2) {
        done = true; setLeaving(true);
        setTimeout(() => appView.set("home"), 420);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return leaving;
}
