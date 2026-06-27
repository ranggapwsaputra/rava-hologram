import { useEffect, useRef } from "react";

// Recreates the JARVIS loading pin: core ignites → HUD ring assembles → flash → plexus blooms.
export default function LoadingSequence() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!, ctx = cv.getContext("2d")!;
    const DPR = Math.min(2, window.devicePixelRatio || 1);
    let raf = 0; const t0 = performance.now();
    const rz = () => { cv.width = innerWidth * DPR; cv.height = innerHeight * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); };
    rz(); window.addEventListener("resize", rz);
    const W = () => cv.width / DPR, H = () => cv.height / DPR;
    const C = "rgba(95,230,255,";
    let nodes: any[] = [], sparks: any[] = [], spawned = false;

    const spawn = () => {
      const cx = W() / 2, cy = H() / 2;
      for (let i = 0; i < 74; i++) { const a = Math.random() * 7, sp = (18 + Math.random() * 120) / 60; nodes.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp }); }
      for (let i = 0; i < 46; i++) { const a = Math.random() * 7, sp = (140 + Math.random() * 260) / 60; sparks.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1 }); }
    };

    const draw = () => {
      const t = (performance.now() - t0) / 1000, cx = W() / 2, cy = H() / 2;
      ctx.clearRect(0, 0, W(), H());

      // CORE ignites
      const coreA = Math.min(1, t / 1.0) * 0.9, cr = 8 + Math.min(1, t / 1.0) * 10 + Math.sin(t * 3) * 2;
      let g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr * 6);
      g.addColorStop(0, C + coreA + ")"); g.addColorStop(1, C + "0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, cr * 6, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(225,250,255," + coreA + ")"; ctx.beginPath(); ctx.arc(cx, cy, cr * 0.5, 0, 7); ctx.fill();

      // RING assembles (1.0 → 3.0s)
      if (t > 1.0) {
        const p = Math.min(1, (t - 1.0) / 2.0), R = Math.min(W(), H()) * 0.17;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.4);
        for (let k = 0; k < 3; k++) {
          const rr = R * (0.7 + k * 0.2);
          ctx.strokeStyle = C + (0.5 * p * (1 - k * 0.18)) + ")"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(0, 0, rr, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2 * (k % 2 ? -1 : 1)); ctx.stroke();
          if (k === 1) for (let i = 0; i < 48; i++) { const a = i / 48 * 7, on = i % 2 === 0 ? 1 : 0.3; ctx.strokeStyle = C + (0.4 * p * on) + ")"; ctx.beginPath(); ctx.moveTo(Math.cos(a) * (rr + 4), Math.sin(a) * (rr + 4)); ctx.lineTo(Math.cos(a) * (rr + 10), Math.sin(a) * (rr + 10)); ctx.stroke(); }
        }
        ctx.restore();
      }

      // FLASH + spawn (~2.9s)
      if (t > 2.9 && !spawned) { spawned = true; spawn(); }
      if (t > 2.9 && t < 3.7) {
        const fa = 1 - (t - 2.9) / 0.8, fr = Math.min(W(), H()) * 0.5;
        const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, fr);
        fg.addColorStop(0, "rgba(210,248,255," + (fa * 0.8) + ")"); fg.addColorStop(1, C + "0)");
        ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(cx, cy, fr, 0, 7); ctx.fill();
      }
      sparks.forEach(s => { s.x += s.vx; s.y += s.vy; s.life -= 0.02; if (s.life > 0) { ctx.strokeStyle = C + (s.life * 0.6) + ")"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 2, s.y - s.vy * 2); ctx.stroke(); } });
      sparks = sparks.filter(s => s.life > 0);

      // PLEXUS blooms
      if (spawned) {
        const pa = Math.min(1, (t - 3.2) / 1.4);
        nodes.forEach(n => { n.x += n.vx; n.y += n.vy; if (n.x < 0 || n.x > W()) n.vx *= -1; if (n.y < 0 || n.y > H()) n.vy *= -1; n.vx *= 0.992; n.vy *= 0.992; });
        for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) { const a = nodes[i], b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y); if (d < 150) { ctx.strokeStyle = C + (0.18 * pa * (1 - d / 150)) + ")"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } }
        nodes.forEach(n => { ctx.fillStyle = "rgba(150,235,255," + (0.6 * pa) + ")"; ctx.beginPath(); ctx.arc(n.x, n.y, 1.5, 0, 7); ctx.fill(); });
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", rz); };
  }, []);
  return <canvas ref={ref} style={{ position: "absolute", inset: 0, zIndex: 1 }} />;
}
