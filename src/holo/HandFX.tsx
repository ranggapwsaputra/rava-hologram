import { useEffect, useRef } from "react";
import { hand } from "./handState";

// MediaPipe hand skeleton connections
const HC: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];
const TIPS = [4, 8, 12, 16, 20];

export default function HandFX() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!, ctx = c.getContext("2d")!;
    let raf = 0, t = 0;
    const resize = () => { c.width = innerWidth; c.height = innerHeight; };
    resize(); window.addEventListener("resize", resize);
    const draw = () => {
      t += 0.03;
      ctx.clearRect(0, 0, c.width, c.height);
      const lm = hand.landmarks;
      if (lm) {
        const P = (p: any) => [(1 - p.x) * c.width, p.y * c.height] as [number, number];
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        // neon strings
        for (const [a, b] of HC) {
          const [x1, y1] = P(lm[a]), [x2, y2] = P(lm[b]);
          ctx.strokeStyle = "rgba(95,230,255,.9)"; ctx.lineWidth = 2.4;
          ctx.shadowBlur = 16; ctx.shadowColor = "#5fe6ff";
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        }
        // joints
        for (let i = 0; i < lm.length; i++) {
          const [x, y] = P(lm[i]);
          ctx.fillStyle = "#eaffff"; ctx.shadowBlur = 12; ctx.shadowColor = "#7ddfff";
          ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
        }
        // pulsing fingertips
        for (const ti of TIPS) {
          const [x, y] = P(lm[ti]);
          const r = 6 + Math.sin(t * 3 + ti) * 2;
          ctx.strokeStyle = "rgba(160,235,255,.8)"; ctx.lineWidth = 1.6; ctx.shadowBlur = 18; ctx.shadowColor = "#5fe6ff";
          ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} style={{ position: "fixed", inset: 0, zIndex: 6, pointerEvents: "none" }} />;
}
