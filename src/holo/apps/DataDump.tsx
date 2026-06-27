import { useState } from "react";
import AppFrame from "../AppFrame";
import { useExit } from "../useExit";

export default function DataDump() {
  const leaving = useExit();
  const [text, setText] = useState("");
  const [burning, setBurning] = useState(false);
  const [purged, setPurged] = useState(false);

  function incinerate() {
    if (!text.trim() || burning) return;
    setBurning(true);
    setTimeout(() => {
      setBurning(false);
      setText("");
      setPurged(true);
      setTimeout(() => setPurged(false), 1800);
    }, 1500);
  }

  return (
    <AppFrame title="DATA DUMP · INCINERATOR" accent="#ff9d3c" leaving={leaving}>
      <p className="dd-sub">Type out every frustration, every burnout trigger. Hit incinerate — it burns to ash and is gone for good.</p>
      <div className="dd-box">
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="dump it all here…" spellCheck={false} />
        {burning && <div className="ash">{text}</div>}
        {purged && <div className="purged">PURGED ✓</div>}
      </div>
      <button className="hud-btn fire" onClick={incinerate}>🔥 INCINERATE</button>
    </AppFrame>
  );
}
