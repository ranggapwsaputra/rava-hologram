import { useEffect, useRef } from "react";

// JARVIS plexus — drifting nodes with connecting lines (the Pinterest loading vibe).
export default function LoadingFX() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!, x = c.getContext("2d")!;
    let raf = 0;
    const rz = () => { c.width = innerWidth; c.height = innerHeight; };
    rz(); window.addEventListener("resize", rz);
    const N = 72;
    const pts = Array.from({ length: N }, () => ({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, vx: (Math.random() - .5) * .45, vy: (Math.random() - .5) * .45 }));
    const draw = () => {
      x.clearRect(0, 0, c.width, c.height);
      for (const p of pts) { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > c.width) p.vx *= -1; if (p.y < 0 || p.y > c.height) p.vy *= -1; }
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
        const a = pts[i], b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 150) { x.strokeStyle = "rgba(95,230,255," + (0.2 * (1 - d / 150)) + ")"; x.lineWidth = 1; x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke(); }
      }
      for (const p of pts) { x.fillStyle = "rgba(150,235,255,.65)"; x.beginPath(); x.arc(p.x, p.y, 1.5, 0, 7); x.fill(); }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", rz); };
  }, []);
  return <canvas ref={ref} style={{ position: "absolute", inset: 0, zIndex: 1, opacity: .65 }} />;
}
