import { useEffect, useRef, useState } from "react";
import AppFrame from "../AppFrame";
import { useExit } from "../useExit";
import { hand } from "../handState";
import { FloatingParticles } from "../FloatingParticles";

type Mode = null | "orbital" | "rain" | "sensory";
const MODES: { k: Exclude<Mode, null>; label: string; d: string }[] = [
  { k: "orbital", label: "Orbital Mode", d: "Earth from orbit · radio static" },
  { k: "rain", label: "Rain Protocol", d: "Neon cyberpunk downpour" },
  { k: "sensory", label: "Sensory Deprivation", d: "Pure blank space" },
];

function RainCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!, ctx = c.getContext("2d")!;
    let raf = 0;
    const resize = () => { c.width = innerWidth; c.height = innerHeight; };
    resize(); window.addEventListener("resize", resize);
    const drops = Array.from({ length: 260 }, () => ({ x: Math.random() * c.width, y: Math.random() * c.height, l: 8 + Math.random() * 18, s: 6 + Math.random() * 10 }));
    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.strokeStyle = "rgba(120,220,255,.5)"; ctx.lineWidth = 1.1;
      for (const d of drops) {
        ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x, d.y + d.l); ctx.stroke();
        d.y += d.s; if (d.y > c.height) { d.y = -20; d.x = Math.random() * c.width; }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} style={{ position: "absolute", inset: 0 }} />;
}

export default function Environmental() {
  const leaving = useExit();
  const [mode, setMode] = useState<Mode>(null);
  const tiles = useRef<HTMLDivElement>(null);
  const prevPoint = useRef(false);

  useEffect(() => {
    if (mode) return;
    let raf = 0;
    const loop = () => {
      if (hand.present) {
        const f = Math.min(2, Math.max(0, Math.floor(hand.x * 3)));
        if (tiles.current) [...tiles.current.children].forEach((c, i) => c.classList.toggle("on", i === f));
        if (hand.point && !prevPoint.current) setMode(MODES[f].k);
      }
      prevPoint.current = hand.point;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mode]);

  if (mode === "sensory")
    return (
      <div className="env-full black">
        <FloatingParticles particleCount={6000} particleColor1="#9fe9ff" particleColor2="#b69dff" particleSize={9} />
        <div className="env-cap">BLANK SPACE</div>
        <div className="env-exit">↑ throw up to exit</div>
      </div>
    );
  if (mode === "rain")
    return (
      <div className="env-full rainbg">
        <RainCanvas />
        <div className="env-cap rain">RAIN PROTOCOL</div>
        <div className="env-exit">↑ throw up to exit</div>
      </div>
    );
  if (mode === "orbital")
    return (
      <div className="env-full orbital">
        <div className="stars" />
        <div className="globe" />
        <div className="env-cap">ORBITAL MODE</div>
        <div className="env-exit">↑ throw up to exit</div>
      </div>
    );

  return (
    <AppFrame title="ENVIRONMENTAL OVERRIDES" accent="#6ad0ff" leaving={leaving}>
      <p className="dd-sub">Override your surroundings. Swipe to highlight, point to enter.</p>
      <div className="env-tiles" ref={tiles}>
        {MODES.map((m, i) => (
          <button key={m.k} className={"env-tile" + (i === 0 ? " on" : "")} onClick={() => setMode(m.k)}>
            <b>{m.label}</b><span>{m.d}</span>
          </button>
        ))}
      </div>
    </AppFrame>
  );
}
