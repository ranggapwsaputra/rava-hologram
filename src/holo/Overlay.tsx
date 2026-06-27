import { useEffect, useRef } from "react";
import { hand, ui } from "./handState";
import { player } from "./store";
import { tracks } from "./tracks";
import type { View } from "./appStore";
import { GRAB_NAV } from "./Carousel";

const HINTS: Partial<Record<View, string>> = GRAB_NAV
  ? {
    home: "🤏 pinch & drag to spin · 👉 point to open",
    music: "🤏 pinch & drag to spin · 👉 point to play/pause · ✊ hold fist to exit",
    news: "🤏 pinch & drag to read · 👉 point to read by RAVA · ✊ hold fist to exit",
    meme: "🤏 pinch & drag to spin · ✋ left hand to orbit · 👉 point to zoom · ✊ exit",
  }
  : {
    home: "✋ swipe to browse · 👉 point to open",
    music: "✋ swipe to flip · 👉 point to play/pause · ✊ hold fist to exit",
    news: "✋ swipe to flip · 👉 point to read by RAVA · ✊ hold fist to exit",
    meme: "🤏 pinch & drag to spin · ✋ left hand to orbit · 👉 point to zoom · ✊ exit",
  };

export default function Overlay({ view }: { view: View }) {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const np = useRef<HTMLDivElement>(null);
  const npT = useRef<HTMLDivElement>(null);
  const npA = useRef<HTMLDivElement>(null);
  const lastPlaying = useRef(-1);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      if (dot.current) {
        dot.current.style.left = hand.x * 100 + "%";
        dot.current.style.top = hand.y * 100 + "%";
        dot.current.style.opacity = hand.present ? "1" : "0";
        dot.current.classList.toggle("pinch", hand.point);
      }
      if (ring.current) {
        ring.current.style.left = hand.x * 100 + "%";
        ring.current.style.top = hand.y * 100 + "%";
        // fist-to-exit charge (red-ish) takes priority; otherwise show point-to-open charge (cyan)
        if (ui.exitProgress > 0.02) {
          ring.current.style.opacity = "1";
          ring.current.style.background = `conic-gradient(#ff7a5f ${ui.exitProgress * 360}deg, rgba(255,255,255,.14) 0)`;
        } else if (ui.pointProgress > 0.02) {
          ring.current.style.opacity = "1";
          ring.current.style.background = `conic-gradient(#5fe6ff ${ui.pointProgress * 360}deg, rgba(255,255,255,.14) 0)`;
        } else ring.current.style.opacity = "0";
      }
      if (view === "music" && player.playingIndex !== lastPlaying.current && player.playingIndex >= 0) {
        lastPlaying.current = player.playingIndex;
        const t = tracks[player.playingIndex];
        if (npT.current) npT.current.textContent = t.title;
        if (npA.current) npA.current.textContent = t.artist;
        if (np.current) { np.current.style.opacity = "1"; np.current.style.setProperty("--c", t.color); }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [view]);

  return (
    <>
      <div className="reticle" />
      <div className="exit-ring" ref={ring} />
      <div className="cursor-dot" ref={dot} />

      {view === "home" && (
        <div className="welcome">
          <div className="wbox">
            <div className="tag">Hologram Mode</div>
            <h2>RAVA Space Hologram</h2>
            <p>A holographic, Iron-Man-inspired playground designed for you to safely explore and unwind when you're feeling burned out. Point at an app to open it.</p>
          </div>
        </div>
      )}

      <div ref={np} className="fixed left-1/2 -translate-x-1/2 bottom-16 z-30 px-5 py-3 rounded-full opacity-0 transition-opacity duration-500 pointer-events-none"
        style={{ background: "rgba(6,12,18,.6)", backdropFilter: "blur(8px)", border: "1px solid var(--c,#5fe6ff)", boxShadow: "0 0 26px var(--c,#5fe6ff)", display: view === "music" ? undefined : "none" }}>
        <div className="flex items-center gap-3 text-white">
          <span style={{ color: "var(--c)" }}>▶</span>
          <div className="text-left">
            <div ref={npT} className="text-sm font-bold leading-none">—</div>
            <div ref={npA} className="text-[11px] text-white/60 mt-1">—</div>
          </div>
        </div>
      </div>

      {HINTS[view] && (
        <div className="fixed bottom-6 left-0 right-0 text-center z-30 text-cyan-100/45 text-[11px] tracking-[0.18em] uppercase pointer-events-none">
          {HINTS[view]}
        </div>
      )}
    </>
  );
}
