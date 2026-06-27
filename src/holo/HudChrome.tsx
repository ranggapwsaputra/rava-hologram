// HudChrome.tsx — Futuristic JARVIS-style HUD chrome overlay with vector graphics & live-looking telemetry
import { useEffect, useState } from "react";

export default function HudChrome() {
  const [secVal, setSecVal] = useState(0);

  // Generate slight variance in numerical readouts to make it feel alive
  useEffect(() => {
    const t = setInterval(() => {
      setSecVal(Math.floor(Math.random() * 100));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="hud">
      {/* ── Outer Bracket Corners ── */}
      <span className="br tl" />
      <span className="br tr" />
      <span className="br bl" />
      <span className="br br2" />

      {/* ── Status Text Labels ── */}
      <div className="hud-read tl-r">R.A.V.A OS · v0.5 [JARVIS_CORE]</div>
      <div className="hud-read tr-r">◉ HAND-TRACK : ACTIVE</div>
      <div className="hud-read bl-r">SYS // ONLINE · SEC_LINK_{secVal}%</div>
      <div className="hud-read br-r">RAVA_HOLOGRAM_MODE</div>
      <div className="hud-scan" />

      {/* ── Left Sidebar: Atmospheric Analysis & Pulse Telemetry ── */}
      <div style={{
        position: "absolute", left: 24, top: "25%", bottom: "25%", width: 140,
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        color: "rgba(95,230,255,.45)", fontSize: 8, fontFamily: "monospace",
        letterSpacing: ".12em", pointerEvents: "none", textShadow: "0 0 6px rgba(95,230,255,.2)",
      }}>
        <div>
          <div style={{ borderBottom: "1px solid rgba(95,230,255,.25)", paddingBottom: 4, marginBottom: 6, fontWeight: 900, color: "rgba(95,230,255,.8)" }}>ATMOSPHERIC ANALYSIS</div>
          <div>CO2: 0.04%</div>
          <div>O2: 20.9%</div>
          <div>HUMID: 52%</div>
          {/* Micro SVG Waveform */}
          <svg width="100" height="24" style={{ marginTop: 8, opacity: 0.85 }}>
            <path d="M0,12 Q15,4 30,12 T60,12 T90,12" fill="none" stroke="#5fe6ff" strokeWidth="1" strokeDasharray="3 2" />
            <path d="M0,12 Q15,2 30,12 T60,12 T90,12" fill="none" stroke="#5fe6ff" strokeWidth="1" opacity="0.5" />
          </svg>
        </div>

        <div>
          <div style={{ borderBottom: "1px solid rgba(95,230,255,.25)", paddingBottom: 4, marginBottom: 6, fontWeight: 900, color: "rgba(95,230,255,.8)" }}>RADAR SATELLITE</div>
          <div>RANGE: 4.8m</div>
          <div>SWEEP: 360°</div>
          <div style={{ display: "flex", gap: 3, marginTop: 6 }}>
            {Array.from({ length: 12 }).map((_, idx) => (
              <span key={idx} style={{
                width: 4, height: 8,
                background: idx < 8 ? "#5fe6ff" : "rgba(95,230,255,.15)",
                boxShadow: idx < 8 ? "0 0 6px #5fe6ff" : "none",
                borderRadius: 1,
              }} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Right Sidebar: Signal Strength & Data Analysis ── */}
      <div style={{
        position: "absolute", right: 24, top: "25%", bottom: "25%", width: 140,
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        alignItems: "flex-end",
        color: "rgba(95,230,255,.45)", fontSize: 8, fontFamily: "monospace",
        letterSpacing: ".12em", pointerEvents: "none", textShadow: "0 0 6px rgba(95,230,255,.2)",
      }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ borderBottom: "1px solid rgba(95,230,255,.25)", paddingBottom: 4, marginBottom: 6, fontWeight: 900, color: "rgba(95,230,255,.8)" }}>SENSOR FEED</div>
          <div>TF_DB: 5.86-AC</div>
          <div>FPS: 60</div>
          <div>LATENCY: 14.2ms</div>
          {/* Micro Telemetry Graph */}
          <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 28, marginTop: 8, width: 80, marginLeft: "auto" }}>
            {[12, 18, 8, 22, 14, 26, 16, 20, 10, 24].map((h, i) => (
              <div key={i} style={{
                flex: 1, height: h,
                background: "rgba(95,230,255,.45)",
                boxShadow: "0 0 4px rgba(95,230,255,.3)",
              }} />
            ))}
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ borderBottom: "1px solid rgba(95,230,255,.25)", paddingBottom: 4, marginBottom: 6, fontWeight: 900, color: "rgba(95,230,255,.8)" }}>DATA ANALYSIS</div>
          <div>CORE_T: 44.2°C</div>
          <div>LOAD: 12.8%</div>
          <div style={{ display: "flex", gap: 3, marginTop: 6, justifyContent: "flex-end" }}>
            {Array.from({ length: 8 }).map((_, idx) => (
              <span key={idx} style={{
                width: 8, height: 4,
                background: idx < 6 ? "#5fe6ff" : "rgba(95,230,255,.15)",
                boxShadow: idx < 6 ? "0 0 6px #5fe6ff" : "none",
                borderRadius: 1,
              }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
