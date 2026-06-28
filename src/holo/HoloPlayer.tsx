import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Canvas } from "@react-three/fiber";
import Home from "./Home";
import MusicApp from "./apps/MusicApp";
import RobotApp from "./apps/RobotApp";
import MemeApp from "./apps/MemeApp";
import MemeGallery from "./apps/MemeGallery";
import { memeStore, memeEvents } from "./memeStore";
import type { Meme } from "./memeStore";
import GestureFxApp from "./apps/GestureFxApp";
import ChordLabApp from "./apps/ChordLabApp";
import NewsApp from "./apps/NewsApp";
import NewsCarousel from "./apps/NewsCarousel";
import { newsStore, newsEvents } from "./newsStore";
import type { NewsItem } from "./newsStore";
import WindowMenu, { WINDOW_MENU } from "./WindowMenu";
import Overlay from "./Overlay";
import HudChrome from "./HudChrome";
import HandFX from "./HandFX";
import BootSequence from "./BootSequence";
import { hand, multiHand } from "./handState";
import { resumeAudio } from "./audio";
import { powerOn } from "./boot";
import { appView } from "./appStore";
import GlobalVoiceAgent from "./GlobalVoiceAgent";
import { onClap, onStatusChange } from "./voiceBridge";
import type { } from "./voiceBridge";

let _lastX = 0.5, _lastY = 0.5;
const d2 = (a: any, b: any) => Math.hypot(a.x - b.x, a.y - b.y);
function onResults(res: any) {
  multiHand.list = res.multiHandLandmarks || [];
  const lm = res.multiHandLandmarks?.[0];
  if (!lm) { hand.present = false; hand.point = false; hand.grab = false; hand.open = false; hand.vx = 0; hand.vy = 0; hand.landmarks = null; return; }
  hand.present = true;
  const x = 1 - lm[9].x, y = lm[9].y;
  hand.vx = x - _lastX; _lastX = x;
  hand.vy = y - _lastY; _lastY = y;
  hand.x = x; hand.y = y;
  hand.landmarks = lm;
  const ext = (tip: number, pip: number) => d2(lm[tip], lm[0]) > d2(lm[pip], lm[0]) * 1.08;
  const idx = ext(8, 6), mid = ext(12, 10), rng = ext(16, 14), pnk = ext(20, 18);
  hand.point = idx && !mid && !rng && !pnk;
  hand.grab = !idx && !mid && !rng && !pnk;
  hand.open = idx && mid && rng && pnk;
  hand.pinchDist = d2(lm[4], lm[8]);           // thumb tip ↔ index tip
  hand.pinch = !hand.grab && hand.pinchDist < 0.06; // tips pinched, but not a full fist
}

export default function HoloPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [booting, setBooting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<"connecting" | "ready" | "disconnected">("disconnected");
  const startedRef = useRef(false);
  const trackingRef = useRef(false);
  const view = useSyncExternalStore(appView.sub, appView.get);

  // Subscribe to WS status so standby screen shows live connection state
  useEffect(() => onStatusChange(setWsStatus), []);

  // Subscribe to news items (written by NewsApp outside Canvas, read here + passed to NewsCarousel)
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  useEffect(() => { return newsEvents.sub(() => setNewsItems([...newsStore.items])); }, []);

  // Subscribe to meme items (written by MemeApp outside Canvas, passed to MemeGallery inside Canvas)
  const [memeItems, setMemeItems] = useState<Meme[]>([]);
  useEffect(() => { return memeEvents.sub(() => setMemeItems([...memeStore.memes])); }, []);

  // start the camera + hand-tracking on load (so the open-hand gesture works on the loading screen)
  async function startTracking() {
    if (trackingRef.current) return;
    trackingRef.current = true;
    const v = videoRef.current!;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: "user" } });
      v.srcObject = stream;
      await v.play();
    } catch { setErr("Allow camera to use hand gestures."); }
    const H = (window as any).Hands, C = (window as any).Camera;
    if (!H || !C) { setErr("Hand-tracking failed to load."); return; }
    const hands = new H({ locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
    hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
    hands.onResults(onResults);
    const cam = new C(v, { onFrame: async () => { await hands.send({ image: v }); }, width: 640, height: 480 });
    cam.start();
  }

  function enter() {
    if (startedRef.current) return;
    startedRef.current = true;
    resumeAudio();
    powerOn();
    setBooting(true);
    setStarted(true);
  }

  // Standby mode by default. Subscribe to acoustic double-clap trigger from voice agent.
  // Use refs to avoid stale closures in the onClap callback.
  const enterRef = useRef(enter);
  enterRef.current = enter;
  const startTrackingRef = useRef(startTracking);
  startTrackingRef.current = startTracking;

  useEffect(() => {
    const unsubscribe = onClap(() => {
      console.info("[HoloPlayer] Acoustic double-clap detected! Waking up R.A.V.A OS...");
      startTrackingRef.current();
      enterRef.current();
    });
    return unsubscribe;
  }, []);

  // Web Audio starts suspended without a user gesture — resume on the first interaction.
  useEffect(() => {
    const resume = () => resumeAudio();
    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });
    return () => { window.removeEventListener("pointerdown", resume); window.removeEventListener("keydown", resume); };
  }, []);

  const dim = view !== "home" && view !== "music" && view !== "news" && view !== "meme";

  // Face-HUD framing (Level 1): a fixed face "window" the HUD wraps around.
  // Tune these to fit your framing — Level 2 will drive them live from FaceMesh.
  const faceVars = {
    ["--face-x" as any]: "50%",   // horizontal center of your face
    ["--face-y" as any]: "44%",   // vertical center (lower = further down)
    ["--face-rx" as any]: "15%",  // half-width of the clear window
    ["--face-ry" as any]: "23%",  // half-height of the clear window
  };
  const faceMask = "radial-gradient(ellipse var(--face-rx) var(--face-ry) at var(--face-x) var(--face-y), transparent 30%, rgba(0,0,0,.5) 70%, #000 100%)";

  return (
    <div className="fixed inset-0 bg-black overflow-hidden" style={faceVars}>
      {/* webcam — lightly graded so the face reads as "lit by the HUD" */}
      <video ref={videoRef} id="holo-cam" className="absolute inset-0 w-full h-full object-cover" style={{ transform: "scaleX(-1)", filter: "brightness(1.06) contrast(1.06) saturate(1.06)" }} playsInline muted />

      {/* spotlight: keep the face bright in the center, darken the surround so the peripheral HUD glows */}
      <div className="absolute inset-0 transition-all duration-500" style={{
        background: dim
          ? "rgba(2,6,12,.72)"
          : "radial-gradient(ellipse 62% 74% at var(--face-x) var(--face-y), transparent 34%, rgba(2,8,14,.55) 78%, rgba(1,5,10,.82) 100%)",
      }} />

      {/* holographic HUD video — screen blend drops the black; the radial mask punches a clear window over the face so the UI frames it instead of covering it */}
      <video
        src={import.meta.env.BASE_URL + "hud-bg.mp4"}
        autoPlay loop muted playsInline
        className="absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-500"
        style={{
          mixBlendMode: "screen",
          opacity: dim ? 0.18 : 0.62,
          // soft-focus the AI-generated HUD so its fake/garbled micro-text reads as glow, not nonsense words
          filter: "blur(1.1px) saturate(1.12)",
          maskImage: faceMask,
          WebkitMaskImage: faceMask,
        }}
      />

      {/* Dynamic tracking orbital rings around the face (hidden inside apps) */}
      {!dim && (
        <>
          {/* Inner solid pulsating ring */}
          <div className="absolute pointer-events-none transition-opacity duration-500" style={{
            left: "var(--face-x)", top: "var(--face-y)", width: "27vw", height: "40.5vh",
            transform: "translate(-50%, -50%)", borderRadius: "50%",
            border: "1.5px solid rgba(95,230,255,.32)",
            boxShadow: "inset 0 0 60px rgba(95,230,255,.16), 0 0 40px rgba(95,230,255,.10)",
            animation: "pulseGlow 2.5s ease-in-out infinite",
          }} />
          {/* Middle dashed clockwise ring */}
          <div className="absolute pointer-events-none transition-opacity duration-500" style={{
            left: "var(--face-x)", top: "var(--face-y)", width: "31vw", height: "46.5vh",
            transform: "translate(-50%, -50%)", borderRadius: "50%",
            border: "1px dashed rgba(95,230,255,.24)",
            animation: "rotateCW 24s linear infinite",
          }} />
          {/* Outer dotted counter-clockwise ring */}
          <div className="absolute pointer-events-none transition-opacity duration-500" style={{
            left: "var(--face-x)", top: "var(--face-y)", width: "35vw", height: "52.5vh",
            transform: "translate(-50%, -50%)", borderRadius: "50%",
            border: "1.2px dotted rgba(168,85,247,.22)",
            animation: "rotateCCW 32s linear infinite",
          }} />
          {/* Tech crosshairs targeting ticks overlay */}
          <div className="absolute pointer-events-none transition-opacity duration-500" style={{
            left: "var(--face-x)", top: "var(--face-y)", width: "33vw", height: "49.5vh",
            transform: "translate(-50%, -50%)", borderRadius: "50%",
            border: "3px double rgba(95,230,255,.12)",
            clipPath: "polygon(48% 0%, 52% 0%, 52% 100%, 48% 100%, 0% 48%, 0% 52%, 100% 52%, 100% 48%)",
          }} />
        </>
      )}

      {started && view !== "gesturefx" && view !== "chordlab" && <HandFX />}

      <Canvas camera={{ position: [0, 0, 0.12], fov: 74 }} dpr={[1, 2]} gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }} className="absolute inset-0 z-10">
        {!WINDOW_MENU && view === "home" && <Home />}
        {view === "music" && <MusicApp />}
        {view === "news" && <NewsCarousel items={newsItems} />}
        {view === "meme" && <MemeGallery memes={memeItems} />}
      </Canvas>

      {started && WINDOW_MENU && view === "home" && <WindowMenu />}

      {booting && <BootSequence onDone={() => setBooting(false)} />}
      {started && <HudChrome />}
      {started && <Overlay view={view} />}
      {started && <GlobalVoiceAgent />}

      {started && view === "robot" && <RobotApp />}
      {started && view === "meme" && <MemeApp />}
      {started && view === "gesturefx" && <GestureFxApp />}
      {started && view === "chordlab" && <ChordLabApp />}
      {started && view === "news" && <NewsApp />}

      {!started && (
        <div
          className="absolute inset-0 z-50 select-none overflow-hidden"
          style={{ cursor: "default", background: "radial-gradient(ellipse at 50% 60%, #020b18 0%, #000508 55%, #000 100%)" }}
        >
          {/* ── Holographic grid background ── */}
          <div style={{
            position: "absolute", inset: 0, opacity: .18,
            backgroundImage: "linear-gradient(rgba(0,212,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,.5) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
            animation: "orb-grid-scroll 8s linear infinite",
          }} />

          {/* ── Scan line ── */}
          <div style={{
            position: "absolute", left: 0, right: 0, height: "2px",
            background: "linear-gradient(90deg, transparent, rgba(0,212,255,.45), rgba(160,80,255,.35), transparent)",
            animation: "orb-scan 5s linear infinite", zIndex: 2,
          }} />

          {/* ── Corner HUD brackets ── */}
          {[["top:18px;left:18px;borderRight:0;borderBottom:0", "tl"], ["top:18px;right:18px;borderLeft:0;borderBottom:0", "tr"], ["bottom:18px;left:18px;borderRight:0;borderTop:0", "bl"], ["bottom:18px;right:18px;borderLeft:0;borderTop:0", "br"]].map(([s, k]) => (
            <div key={k} style={{ position: "absolute", width: 28, height: 28, border: "1.5px solid rgba(0,212,255,.45)", ...Object.fromEntries((s as string).split(";").filter(Boolean).map(p => { const [a, b] = p.split(":"); return [a.trim(), b.trim()]; })) }} />
          ))}

          {/* ── Telemetry readout top-left ── */}
          <div style={{ position: "absolute", top: 22, left: 56, fontFamily: "monospace", fontSize: 9, letterSpacing: ".22em", color: "rgba(0,212,255,.6)", animation: "orb-flicker 6s infinite" }}>
            R.A.V.A OS · MODE STANDBY
          </div>
          <div style={{ position: "absolute", top: 32, left: 56, fontFamily: "monospace", fontSize: 8, letterSpacing: ".18em", color: "rgba(0,212,255,.35)" }}>
            ACOUSTIC SENSOR ACTIVE
          </div>

          {/* ── Telemetry readout top-right ── */}
          <div style={{ position: "absolute", top: 22, right: 56, fontFamily: "monospace", fontSize: 9, letterSpacing: ".22em", color: "rgba(160,80,255,.7)", textAlign: "right", animation: "orb-data-blink 2.4s ease-in-out infinite" }}>
            CLAP DETECTION: ON
          </div>

          {/* ── Main ORBS stage (centered) ── */}
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>

            {/* Orbs container */}
            <div style={{ position: "relative", width: 520, height: 520, display: "flex", alignItems: "center", justifyContent: "center" }}>

              {/* ── Outer ring 3 (slowest, dashed) ── */}
              <div style={{
                position: "absolute", width: 490, height: 490, borderRadius: "50%",
                border: "1px dashed rgba(0,212,255,.12)",
                animation: "orb-ring-cw 40s linear infinite",
              }} />

              {/* ── Outer ring 2 ── */}
              <div style={{
                position: "absolute", width: 420, height: 420, borderRadius: "50%",
                border: "1px solid rgba(110,55,255,.2)",
                boxShadow: "0 0 30px rgba(110,55,255,.06) inset",
                animation: "orb-ring-ccw 28s linear infinite",
              }} />

              {/* ── Outer ring 1 ── */}
              <div style={{
                position: "absolute", width: 340, height: 340, borderRadius: "50%",
                border: "1px solid rgba(0,212,255,.22)",
                boxShadow: "0 0 40px rgba(0,212,255,.08) inset",
                animation: "orb-ring-cw 18s linear infinite",
              }} />

              {/* ── Mid ring ── */}
              <div style={{
                position: "absolute", width: 260, height: 260, borderRadius: "50%",
                border: "1.5px solid rgba(0,212,255,.35)",
                boxShadow: "0 0 50px rgba(0,212,255,.12) inset, 0 0 25px rgba(0,212,255,.12)",
                animation: "orb-ring-ccw 12s linear infinite",
              }} />

              {/* ── Inner ring ── */}
              <div style={{
                position: "absolute", width: 160, height: 160, borderRadius: "50%",
                border: "1px solid rgba(160,80,255,.5)",
                boxShadow: "0 0 30px rgba(160,80,255,.15) inset",
                animation: "orb-ring-cw 7s linear infinite",
              }} />

              {/* ── Orbiting orb 1 — cyan, orbit r=120 ── */}
              <div style={{ position: "absolute", width: 0, height: 0, animation: "orb-orbit-1 8s linear infinite" }}>
                <div style={{
                  width: 18, height: 18, borderRadius: "50%", marginLeft: -9, marginTop: -9,
                  background: "radial-gradient(circle, #fff 10%, #00d4ff 50%, rgba(0,180,255,.2) 100%)",
                  boxShadow: "0 0 18px 6px rgba(0,212,255,.9), 0 0 40px 12px rgba(0,212,255,.4)",
                  animation: "orb-float 3.2s ease-in-out infinite",
                }} />
              </div>

              {/* ── Orbiting orb 2 — violet, orbit r=165 ── */}
              <div style={{ position: "absolute", width: 0, height: 0, animation: "orb-orbit-2 13s linear infinite" }}>
                <div style={{
                  width: 14, height: 14, borderRadius: "50%", marginLeft: -7, marginTop: -7,
                  background: "radial-gradient(circle, #fff 8%, #a855f7 55%, rgba(160,60,255,.2) 100%)",
                  boxShadow: "0 0 14px 5px rgba(168,85,247,.9), 0 0 32px 10px rgba(168,85,247,.4)",
                  animation: "orb-float 4.1s ease-in-out .8s infinite",
                }} />
              </div>

              {/* ── Orbiting orb 3 — gold, orbit r=205 ── */}
              <div style={{ position: "absolute", width: 0, height: 0, animation: "orb-orbit-3 18s linear infinite" }}>
                <div style={{
                  width: 12, height: 12, borderRadius: "50%", marginLeft: -6, marginTop: -6,
                  background: "radial-gradient(circle, #fff 8%, #fbbf24 55%, rgba(251,180,36,.2) 100%)",
                  boxShadow: "0 0 12px 4px rgba(251,191,36,.9), 0 0 28px 9px rgba(251,191,36,.4)",
                  animation: "orb-float 2.8s ease-in-out 1.6s infinite",
                }} />
              </div>

              {/* ── Orbiting orb 4 — teal, orbit r=148 ── */}
              <div style={{ position: "absolute", width: 0, height: 0, animation: "orb-orbit-4 10s linear infinite reverse" }}>
                <div style={{
                  width: 10, height: 10, borderRadius: "50%", marginLeft: -5, marginTop: -5,
                  background: "radial-gradient(circle, #fff 8%, #2dd4bf 55%, rgba(45,212,191,.2) 100%)",
                  boxShadow: "0 0 10px 4px rgba(45,212,191,.9), 0 0 24px 8px rgba(45,212,191,.4)",
                  animation: "orb-float 5s ease-in-out 2s infinite",
                }} />
              </div>

              {/* ── Orbiting orb 5 — pink, orbit r=238 ── */}
              <div style={{ position: "absolute", width: 0, height: 0, animation: "orb-orbit-5 22s linear infinite" }}>
                <div style={{
                  width: 9, height: 9, borderRadius: "50%", marginLeft: -4.5, marginTop: -4.5,
                  background: "radial-gradient(circle, #fff 8%, #f472b6 55%, rgba(244,114,182,.2) 100%)",
                  boxShadow: "0 0 9px 3px rgba(244,114,182,.9), 0 0 22px 7px rgba(244,114,182,.4)",
                  animation: "orb-float 3.6s ease-in-out .4s infinite",
                }} />
              </div>

              {/* ── Orbiting orb 6 — orange, orbit r=185 ── */}
              <div style={{ position: "absolute", width: 0, height: 0, animation: "orb-orbit-6 15s linear infinite reverse" }}>
                <div style={{
                  width: 11, height: 11, borderRadius: "50%", marginLeft: -5.5, marginTop: -5.5,
                  background: "radial-gradient(circle, #fff 8%, #fb923c 55%, rgba(251,146,60,.2) 100%)",
                  boxShadow: "0 0 11px 4px rgba(251,146,60,.9), 0 0 26px 8px rgba(251,146,60,.4)",
                  animation: "orb-float 4.4s ease-in-out 1.2s infinite",
                }} />
              </div>

              {/* ── CORE orb (RAVA center) ── */}
              <div style={{
                width: 90, height: 90, borderRadius: "50%",
                background: "radial-gradient(circle at 38% 35%, rgba(255,255,255,.95) 0%, #40e0ff 20%, #0099dd 45%, #5522cc 75%, #220055 100%)",
                animation: "orb-core-pulse 3s ease-in-out infinite",
                position: "relative", zIndex: 5, display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {/* Core inner glow shimmer */}
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(255,255,255,.9), rgba(180,230,255,.5) 60%, transparent)",
                  boxShadow: "0 0 16px 6px rgba(255,255,255,.6)",
                }} />
              </div>
            </div>

            {/* ── R.A.V.A logo + tagline ── */}
            <div style={{ marginTop: 28, textAlign: "center", position: "relative", zIndex: 6 }}>
              <div style={{
                fontFamily: "monospace", fontSize: 11, letterSpacing: ".45em", fontWeight: 900, textTransform: "uppercase",
                color: "rgba(0,212,255,.6)", marginBottom: 8, animation: "orb-data-blink 3s ease-in-out infinite",
              }}>
                SYSTEM IN STANDBY MODE
              </div>

              {/* ── Live WS status ── */}
              <div style={{ marginTop: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <span style={{
                  width: 7, height: 7, borderRadius: "50%", display: "inline-block",
                  background: wsStatus === "ready" ? "#4ade80" : wsStatus === "connecting" ? "#facc15" : "#f87171",
                  boxShadow: wsStatus === "ready" ? "0 0 10px #4ade80, 0 0 20px rgba(74,222,128,.4)" : wsStatus === "connecting" ? "0 0 10px #facc15" : "0 0 10px #f87171",
                  animation: wsStatus === "ready" ? "orb-data-blink 2s infinite" : "none",
                }} />
                <span style={{
                  fontFamily: "monospace", fontSize: 9, letterSpacing: ".18em", textTransform: "uppercase",
                  color: wsStatus === "ready" ? "#4ade80" : wsStatus === "connecting" ? "#facc15" : "#f87171"
                }}>
                  {wsStatus === "ready" ? "AGENT R.A.V.A ONLINE" : wsStatus === "connecting" ? "CONNECTING TO AGENT…" : "AGENT OFFLINE — RUN: python jarvis.py"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {err && (
        <div style={{
          position: "absolute", bottom: 18, left: "50%", transform: "translateX(-50%)", zIndex: 60,
          color: "#9fe8ff", background: "rgba(2,8,14,.72)", border: "1px solid rgba(95,230,255,.3)",
          borderRadius: 20, padding: "8px 16px", fontSize: 13, letterSpacing: ".04em"
        }}>{err} ✋</div>
      )}
    </div>
  );
}
