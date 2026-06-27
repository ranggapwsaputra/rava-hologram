import { useEffect, useRef, useState } from "react";
import AppFrame from "../AppFrame";
import { hand, ui } from "../handState";
import { appView } from "../appStore";
import { SplineScene } from "../SplineScene";
import { FrostedHover } from "../FrostedHover";

type Mode = null | "spline" | "meme";
const MODES: { k: Exclude<Mode, null>; label: string; d: string }[] = [
  { k: "spline", label: "Interactive 3D", d: "Grab & spin a 3D object" },
  { k: "meme", label: "Meme of the Day", d: "Wave across to defrost it" },
];
const MEMES = [import.meta.env.BASE_URL + "memes/meme1.jpg"];
const HOLD = 0.85;

export default function VisualEscapes() {
  const [mode, setMode] = useState<Mode>(null);
  const modeRef = useRef<Mode>(null);
  const tiles = useRef<HTMLDivElement>(null);
  const prevPoint = useRef(false);
  const cd = useRef(0);
  const held = useRef(0);
  const meme = MEMES[0];

  function go(m: Mode) { modeRef.current = m; setMode(m); }

  useEffect(() => {
    let raf = 0, last = performance.now();
    const loop = () => {
      const now = performance.now(), dt = (now - last) / 1000; last = now;
      cd.current -= dt;
      // hold a fist to exit (escape → menu, menu → home)
      if (hand.present && hand.grab) {
        held.current += dt; ui.exitProgress = Math.min(1, held.current / HOLD);
        if (held.current >= HOLD) {
          held.current = 0; ui.exitProgress = 0; cd.current = 0.4;
          if (modeRef.current) go(null); else appView.set("home");
        }
      } else {
        held.current = 0; ui.exitProgress = 0;
        // picker navigation (only when not in a mode)
        if (!modeRef.current && hand.present && cd.current <= 0) {
          const f = Math.min(MODES.length - 1, Math.max(0, Math.floor(hand.x * MODES.length)));
          if (tiles.current) [...tiles.current.children].forEach((c, i) => c.classList.toggle("on", i === f));
          if (hand.point && !prevPoint.current) { go(MODES[f].k); cd.current = 0.5; }
        }
      }
      prevPoint.current = hand.point;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ui.exitProgress = 0; };
  }, []);

  if (mode === "spline")
    return (
      <div className="env-full black">
        <SplineScene scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode" className="w-full h-full" />
        <div className="env-cap">INTERACTIVE 3D</div>
        <div className="env-exit">✊ hold a fist to exit</div>
      </div>
    );
  if (mode === "meme")
    return (
      <div className="env-full meme">
        <div className="meme-wrap">
          <div className="meme-cap">MEME OF THE DAY</div>
          <FrostedHover image={meme} />
          <div className="meme-hint">hover / wave across to defrost</div>
        </div>
        <div className="env-exit">✊ hold a fist to exit</div>
      </div>
    );

  return (
    <AppFrame title="VISUAL ESCAPES" accent="#b69dff" leaving={false}>
      <p className="dd-sub">Pick an escape to play with. Swipe to highlight, point to enter.</p>
      <div className="env-tiles" ref={tiles}>
        {MODES.map((m, i) => (
          <button key={m.k} className={"env-tile" + (i === 0 ? " on" : "")} onClick={() => go(m.k)}>
            <b>{m.label}</b><span>{m.d}</span>
          </button>
        ))}
      </div>
    </AppFrame>
  );
}
