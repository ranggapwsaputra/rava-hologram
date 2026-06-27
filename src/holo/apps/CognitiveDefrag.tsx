import { useEffect, useRef } from "react";
import AppFrame from "../AppFrame";
import { useExit } from "../useExit";

export default function CognitiveDefrag() {
  const leaving = useExit();
  const ring = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const CYCLE = 12000; // inhale 4s · hold 2s · exhale 4s · rest 2s
    const loop = () => {
      const t = ((performance.now() - t0) % CYCLE) / 1000;
      let scale = 0.6, txt = "breathe in";
      if (t < 4) { scale = 0.6 + (t / 4) * 0.7; txt = "breathe in"; }
      else if (t < 6) { scale = 1.3; txt = "hold"; }
      else if (t < 10) { scale = 1.3 - ((t - 6) / 4) * 0.7; txt = "breathe out"; }
      else { scale = 0.6; txt = "rest"; }
      if (ring.current) ring.current.style.transform = `scale(${scale})`;
      if (label.current && label.current.textContent !== txt) label.current.textContent = txt;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <AppFrame title="COGNITIVE DEFRAG" accent="#b69dff" leaving={leaving} className="bare">
      <div className="defrag">
        <div className="reactor"><div ref={ring} className="r-rings"><span /><span /><span /><i /></div></div>
        <div ref={label} className="breath-label">breathe in</div>
        <p className="defrag-sub">Sync with the Arc Reactor — inhale as it grows, exhale as it shrinks.</p>
      </div>
    </AppFrame>
  );
}
