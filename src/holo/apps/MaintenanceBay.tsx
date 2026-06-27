import { useRef, useState } from "react";
import AppFrame from "../AppFrame";
import { useExit } from "../useExit";

export default function MaintenanceBay() {
  const leaving = useExit();
  const [cups, setCups] = useState(2);
  const [cal, setCal] = useState<string | null>(null);
  const running = useRef(false);

  function calibrate() {
    if (running.current) return;
    running.current = true;
    const seq = ["Drop your shoulders…", "Unclench your jaw…", "Soften your eyes…", "One slow breath…", "Calibrated ✓"];
    let i = 0;
    setCal(seq[0]);
    const iv = setInterval(() => {
      i++;
      if (i >= seq.length) { clearInterval(iv); setTimeout(() => { setCal(null); running.current = false; }, 1400); }
      else setCal(seq[i]);
    }, 1700);
  }

  return (
    <AppFrame title="MAINTENANCE BAY" accent="#ffd36e" leaving={leaving}>
      <div className="mb-mod">
        <div className="mb-h">💧 Hydration Coolant</div>
        <div className="cups">{Array.from({ length: 8 }).map((_, i) => <span key={i} className={i < cups ? "on" : ""} />)}</div>
        <button className="hud-btn" onClick={() => setCups((c) => Math.min(8, c + 1))}>LOG A GLASS · {cups}/8</button>
      </div>
      <div className="mb-mod">
        <div className="mb-h">🪑 Postural Calibration</div>
        {cal ? <div className="cal">{cal}</div> : <button className="hud-btn" onClick={calibrate}>CALIBRATE POSTURE</button>}
      </div>
    </AppFrame>
  );
}
