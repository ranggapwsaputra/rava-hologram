import { useEffect, useRef, useState } from "react";
import AppFrame from "../AppFrame";
import { useExit } from "../useExit";
import { hand } from "../handState";

export default function SystemDiagnostics() {
  const leaving = useExit();
  const fill = useRef<HTMLDivElement>(null);
  const val = useRef<HTMLDivElement>(null);
  const [locked, setLocked] = useState(false);
  const [protocol, setProtocol] = useState<{ t: string; d: string } | null>(null);
  const lockedRef = useRef(false);
  const prevPoint = useRef(false);

  function pick(e: number) {
    if (e < 30) return { t: "COGNITIVE DEFRAG", d: `Warning: core energy critical at ${e}%. Immediate Cognitive Defrag + hydration advised.` };
    if (e < 65) return { t: "ENVIRONMENTAL OVERRIDE", d: `Running warm at ${e}%. Recommend an Environmental Override to cool down.` };
    return { t: "MAINTAIN", d: `Systems nominal at ${e}%. Keep the vibe — queue some Music.` };
  }

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      if (!lockedRef.current) {
        const energy = Math.round(Math.max(0, Math.min(100, (1 - hand.y) * 120 - 10)));
        if (fill.current) fill.current.style.height = energy + "%";
        if (val.current) val.current.textContent = energy + "%";
        if (hand.present && hand.point && !prevPoint.current) {
          lockedRef.current = true; setLocked(true); setProtocol(pick(energy));
        }
      }
      prevPoint.current = hand.point;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  function rescan() { lockedRef.current = false; setLocked(false); setProtocol(null); }

  return (
    <AppFrame title="SYSTEM DIAGNOSTICS" accent="#ff7a45" leaving={leaving}>
      <div className="diag">
        <div className="gauge">
          <div className="g-track"><div ref={fill} className="g-fill" style={{ height: "40%" }} /></div>
          <div className="g-meta"><div className="g-label">CORE ENERGY</div><div ref={val} className="g-val">40%</div></div>
        </div>
        {!locked ? (
          <div className="diag-hint">✋ raise / lower your hand to report your core energy<br />👉 point to run the scan</div>
        ) : (
          <div className="protocol">
            <div className="p-label">RECOMMENDED PROTOCOL</div>
            <div className="p-title">{protocol?.t}</div>
            <div className="p-desc">{protocol?.d}</div>
            <button className="hud-btn" onClick={rescan}>RESCAN</button>
          </div>
        )}
      </div>
    </AppFrame>
  );
}
