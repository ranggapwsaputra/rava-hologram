import { useEffect, useRef, useState } from "react";
import * as Tone from "tone";
import { multiHand } from "../handState";
import { appView } from "../appStore";
import { tracks } from "../tracks";

// ===== CDJ-style hand-gesture FX rig, native inside the holo player =====
// Reuses the app's shared webcam + MediaPipe (now tracking 2 hands) — no second camera.
// Left/right hand is decided by on-screen X after mirroring, not MediaPipe handedness.

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist = (a: any, b: any) => Math.hypot(a.x - b.x, a.y - b.y);
const HC: [number, number][] = [
  [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17],
];
const TIPS = [4, 8, 12, 16, 20];
const parseYT = (u: string) => {
  const m = (u || "").match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/);
  return m ? m[1] : ((u || "").trim().length === 11 ? u.trim() : null);
};
let ytApiPromise: Promise<any> | null = null;
function loadYTApi(): Promise<any> {
  const w = window as any;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => { prev?.(); resolve(w.YT); };
    if (!document.getElementById("yt-iframe-api")) {
      const s = document.createElement("script"); s.id = "yt-iframe-api"; s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }
  });
  return ytApiPromise;
}
// object-cover-correct mapping so the skeleton/auras land on the displayed (mirrored) webcam
let _camEl: HTMLVideoElement | null = null;
function mapPt(lm: any, W: number, H: number): [number, number] {
  if (!_camEl) _camEl = document.getElementById("holo-cam") as HTMLVideoElement | null;
  const vw = _camEl?.videoWidth || 16, vh = _camEl?.videoHeight || 9;
  const scale = Math.max(W / vw, H / vh), dw = vw * scale, dh = vh * scale;
  const x = lm.x * dw - (dw - W) / 2, y = lm.y * dh - (dh - H) / 2;
  return [W - x, y]; // mirror X to match the webcam
}

export default function GestureFxApp() {
  const [phase, setPhase] = useState<"start" | "running">("start");
  const [ytUrl, setYtUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [noAudio, setNoAudio] = useState(false);
  const [trackIdx, setTrackIdx] = useState(0);
  const noAudioRef = useRef(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const g = useRef<any>({ built: false, baseDry: 1 });
  const gesture = useRef({ rightY: 0.5, leftY: 0.5, rightOpen: 0, leftOpen: 0, handDist: 0 });
  const sm = useRef({ hp: 20, lp: 20000, echo: 0, delay: 0, reverb: 0, flanger: 0 });
  const present = useRef({ left: false, right: false });
  const viewLM = useRef<{ left: any; right: any }>({ left: null, right: null });
  const rollRef = useRef({ on: false, dwell: 0, timer: 0 as any });
  const lastAudio = useRef(0);
  const raf = useRef(0);

  // ---------- audio graph ----------
  function buildGraph() {
    const ac: any = Tone.getContext().rawContext;
    const baseDry = g.current.baseDry;
    const input = new Tone.Gain(1);
    const hp = new Tone.Filter({ type: "highpass", frequency: 20, rolloff: -24 });
    const lp = new Tone.Filter({ type: "lowpass", frequency: 20000, rolloff: -24 });
    const splitter = new Tone.Gain(1);
    const dryGain = new Tone.Gain(baseDry);
    const echo = new Tone.FeedbackDelay({ delayTime: 0.42, feedback: 0.55, wet: 1 });
    const echoSend = new Tone.Gain(0);
    const delay = new Tone.PingPongDelay({ delayTime: 0.22, feedback: 0.32, wet: 1 });
    const delaySend = new Tone.Gain(0);
    const reverb = new Tone.Reverb({ decay: 6, preDelay: 0.03, wet: 1 });
    const reverbSend = new Tone.Gain(0);
    const flanger = new Tone.Chorus({ frequency: 0.45, delayTime: 3.5, depth: 0.85, feedback: 0.55, spread: 90, wet: 1 }).start();
    const flangerSend = new Tone.Gain(0);
    const rollIn = new Tone.Gain(0);
    const roll = new Tone.FeedbackDelay({ delayTime: 0.125, feedback: 0, wet: 1 });
    const rollSend = new Tone.Gain(0);
    const output = new Tone.Gain(1);
    const meter = new Tone.Meter();

    input.connect(splitter);
    input.connect(meter);
    // dry path carries the FILTER (so the filter shapes the main sound)…
    splitter.chain(hp, lp, dryGain); dryGain.connect(output);
    // …but the effects tap the UNFILTERED signal, so they stay audible no matter where the filter is set
    splitter.connect(echo); echo.connect(echoSend); echoSend.connect(output);
    splitter.connect(delay); delay.connect(delaySend); delaySend.connect(output);
    splitter.connect(reverb); reverb.connect(reverbSend); reverbSend.connect(output);
    splitter.connect(flanger); flanger.connect(flangerSend); flangerSend.connect(output);
    splitter.connect(rollIn); rollIn.connect(roll); roll.connect(rollSend); rollSend.connect(output);
    output.toDestination();

    g.current = { ...g.current, ac, input, hp, lp, splitter, dryGain, echo, echoSend, delay, delaySend,
      reverb, reverbSend, flanger, flangerSend, rollIn, roll, rollSend, output, meter, built: true };
  }

  // ---------- roll ----------
  function engageRoll() {
    const a = g.current; if (!a.built) return;
    rollRef.current.on = true;
    a.rollIn.gain.linearRampTo(1, 0.04);
    a.roll.feedback.linearRampTo(0.30, 0.04);
    clearTimeout(rollRef.current.timer);
    rollRef.current.timer = setTimeout(() => {
      a.rollIn.gain.linearRampTo(0, 0.05);
      a.roll.feedback.linearRampTo(0.94, 0.06);
      a.dryGain.gain.linearRampTo(0, 0.04);
      a.rollSend.gain.linearRampTo(1, 0.05);
    }, 130);
  }
  function disengageRoll() {
    const a = g.current; if (!a.built) return;
    rollRef.current.on = false;
    clearTimeout(rollRef.current.timer);
    a.roll.feedback.linearRampTo(0, 0.08);
    a.rollSend.gain.linearRampTo(0, 0.06);
    a.dryGain.gain.linearRampTo(a.baseDry, 0.05);
    a.rollIn.gain.linearRampTo(1, 0.05);
  }
  function detectRoll() {
    const G = gesture.current, P = present.current;
    const closed = P.left && P.right && G.leftOpen < 0.10 && G.rightOpen < 0.10;
    const now = performance.now();
    if (closed) {
      if (!rollRef.current.dwell) rollRef.current.dwell = now;
      if (!rollRef.current.on && now - rollRef.current.dwell >= 90) engageRoll();
    } else {
      rollRef.current.dwell = 0;
      if (rollRef.current.on) disengageRoll();
    }
  }

  // ---------- per-frame gesture extraction (raw smoothing 0.25, safe defaults when a hand is missing) ----------
  function classify() {
    const list = multiHand.list || [];
    let L: any = null, R: any = null;
    if (list.length === 1) { const mx = 1 - list[0][0].x; if (mx < 0.5) L = list[0]; else R = list[0]; }
    else if (list.length >= 2) {
      const arr = list.map((h: any) => ({ h, mx: 1 - h[0].x })).sort((a: any, b: any) => a.mx - b.mx);
      L = arr[0].h; R = arr[arr.length - 1].h;
    }
    present.current.left = !!L; present.current.right = !!R;
    viewLM.current.left = L; viewLM.current.right = R;

    const G = gesture.current;
    const rawRY = R ? R[0].y : 0.5, rawLY = L ? L[0].y : 0.5;
    const rawRO = R ? dist(R[4], R[20]) : 0, rawLO = L ? dist(L[4], L[20]) : 0;
    const rawHD = (L && R) ? dist(L[0], R[0]) : 0;
    G.rightY    += ((R ? rawRY : 0.5) - G.rightY) * 0.25;
    G.leftY     += ((L ? rawLY : 0.5) - G.leftY) * 0.25;
    G.rightOpen += ((R ? rawRO : 0) - G.rightOpen) * 0.25;
    G.leftOpen  += ((L ? rawLO : 0) - G.leftOpen) * 0.25;
    G.handDist  += (((L && R) ? rawHD : 0) - G.handDist) * 0.25;
  }

  // ---------- audio update (~30 Hz, 40ms ramps, hard-gated to neutral when a hand is missing) ----------
  function updateAudio() {
    const a = g.current; if (!a.built) return;
    const now = performance.now();
    if (now - lastAudio.current < 33) return;
    lastAudio.current = now;
    const G = gesture.current, P = present.current, S = sm.current;

    let hpT = 20, lpT = 20000;
    if (P.right) {
      const ry = G.rightY;
      if (ry < 0.4) { const t = clamp((0.4 - ry) / 0.4, 0, 1); hpT = 80 * Math.pow(8000 / 80, t); }
      if (ry > 0.6) { const t = clamp((ry - 0.6) / 0.4, 0, 1); lpT = 20000 * Math.pow(200 / 20000, t); }
    }
    const delayT   = P.right            ? clamp((G.rightOpen - 0.20) / 0.22, 0, 1) * 0.85 : 0;
    const reverbT  = P.left             ? clamp((0.45 - G.leftY) / 0.4, 0, 1) * 0.75       : 0;
    const echoT    = P.left             ? clamp((G.leftOpen - 0.20) / 0.22, 0, 1) * 0.85   : 0;
    const flangerT = (P.left && P.right)? clamp((G.handDist - 0.35) / 0.5, 0, 1) * 0.85    : 0;

    S.hp += (hpT - S.hp) * 0.18; S.lp += (lpT - S.lp) * 0.18;
    S.delay += (delayT - S.delay) * 0.18; S.reverb += (reverbT - S.reverb) * 0.18;
    S.echo += (echoT - S.echo) * 0.18; S.flanger += (flangerT - S.flanger) * 0.18;

    a.hp.frequency.linearRampTo(S.hp, 0.04);
    a.lp.frequency.linearRampTo(S.lp, 0.04);
    a.delaySend.gain.linearRampTo(S.delay, 0.04);
    a.reverbSend.gain.linearRampTo(S.reverb, 0.04);
    a.echoSend.gain.linearRampTo(S.echo, 0.04);
    a.flangerSend.gain.linearRampTo(S.flanger, 0.04);
  }

  // ---------- canvas drawing ----------
  function ring(ctx: any, x: number, y: number, r: number, col: string, lw: number, blur: number) {
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.shadowColor = col; ctx.shadowBlur = blur;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); ctx.restore();
  }
  function rr(ctx: any, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function bar(ctx: any, x: number, y: number, w: number, label: string, val: number, col: string) {
    ctx.fillStyle = "rgba(255,255,255,.08)"; rr(ctx, x, y, w, 9, 4); ctx.fill();
    ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 10; rr(ctx, x, y, w * clamp(val, 0, 1), 9, 4); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = "#cdeefb"; ctx.font = "10px Helvetica,Arial"; ctx.fillText(label, x, y - 3);
  }
  const SKEL = 0.92; // snug on the hand (just inside the fingertips) now that alignment is correct
  function drawHand(ctx: any, lm: any, col: string, W: number, H: number) {
    const [cx, cy] = mapPt(lm[9], W, H);
    const P = (i: number): [number, number] => { const [x, y] = mapPt(lm[i], W, H); return [cx + (x - cx) * SKEL, cy + (y - cy) * SKEL]; };
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.shadowColor = col; ctx.shadowBlur = 14;
    for (const [a, b] of HC) { const [x1, y1] = P(a), [x2, y2] = P(b); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
    for (let i = 0; i < lm.length; i++) { const big = TIPS.includes(i); const [x, y] = P(i);
      ctx.fillStyle = big ? "#ffffff" : col; ctx.shadowBlur = big ? 17 : 7;
      ctx.beginPath(); ctx.arc(x, y, big ? 4 : 2.5, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  function render(ctx: any, W: number, H: number) {
    const S = sm.current, V = viewLM.current, a = g.current;
    ctx.clearRect(0, 0, W, H);
    if (V.left) drawHand(ctx, V.left, "#00eaff", W, H);
    if (V.right) drawHand(ctx, V.right, "#ff3df0", W, H);

    // right hand → filter ring + delay halo
    if (V.right) {
      const [x, y] = mapPt(V.right[9], W, H);
      const col = S.hp > 40 ? "rgba(255,70,70,.9)" : S.lp < 18000 ? "rgba(80,150,255,.9)" : "rgba(95,230,255,.5)";
      ring(ctx, x, y, 38, col, 3.5, 22);
      if (S.delay > 0.02) ring(ctx, x, y, 38 + S.delay * 58, "rgba(95,230,255,.6)", 3, 22);
    }
    // left hand → reverb (yellow) + echo (magenta)
    if (V.left) {
      const [x, y] = mapPt(V.left[9], W, H);
      ring(ctx, x, y, 34 + S.reverb * 50, S.reverb > 0.02 ? "rgba(255,214,90,.85)" : "rgba(255,214,90,.3)", S.reverb > 0.02 ? 3.5 : 2, 20);
      if (S.echo > 0.02) ring(ctx, x, y, 44 + S.echo * 66, "rgba(255,61,240,.75)", 3, 22);
    }
    // flanger line between hands
    if (V.left && V.right && S.flanger > 0.02) {
      const [x1, y1] = mapPt(V.left[9], W, H), [x2, y2] = mapPt(V.right[9], W, H);
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
      const amp = S.flanger * 52, t = performance.now() / 180;
      ctx.save(); ctx.strokeStyle = "rgba(150,235,255,.8)"; ctx.lineWidth = 2.2; ctx.shadowColor = "#5fe6ff"; ctx.shadowBlur = 16;
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) { const f = i / 40, bx = x1 + dx * f, by = y1 + dy * f, w = Math.sin(f * Math.PI * 6 + t) * amp * Math.sin(f * Math.PI);
        const X = bx + nx * w, Y = by + ny * w; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
      ctx.stroke(); ctx.restore();
    }
    // roll border + label
    if (rollRef.current.on) {
      const al = 0.4 + 0.4 * Math.abs(Math.sin(performance.now() / 180));
      ctx.save(); ctx.strokeStyle = `rgba(255,61,240,${al})`; ctx.lineWidth = 8; ctx.shadowColor = "#ff3df0"; ctx.shadowBlur = 30;
      ctx.strokeRect(5, 5, W - 10, H - 10);
      ctx.fillStyle = `rgba(255,61,240,${al})`; ctx.font = "900 40px Helvetica,Arial"; ctx.textAlign = "center"; ctx.shadowBlur = 24;
      ctx.fillText("▎ROLL", W / 2, 70); ctx.textAlign = "left"; ctx.restore();
    }

    // HUD card
    const hx = 16, hy = 84, hw = 300, hh = 232;
    ctx.save();
    ctx.fillStyle = "rgba(6,14,24,.72)"; ctx.strokeStyle = "rgba(95,230,255,.4)"; ctx.lineWidth = 1;
    rr(ctx, hx, hy, hw, hh, 14); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#5fe6ff"; ctx.font = "800 13px Helvetica,Arial"; ctx.fillText("GESTURE FX · CDJ", hx + 16, hy + 24);
    let db = -60; if (a.meter) { const v = a.meter.getValue(); db = typeof v === "number" ? v : -60; }
    bar(ctx, hx + 16, hy + 44, hw - 32, "INPUT " + db.toFixed(0) + " dB", clamp((db + 60) / 60, 0, 1), "#7dffd0");
    // bipolar filter
    const fx = hx + 16, fy = hy + 76, fw = hw - 32, cx = fx + fw / 2;
    ctx.fillStyle = "rgba(255,255,255,.08)"; rr(ctx, fx, fy, fw, 10, 5); ctx.fill();
    const hpAmt = clamp(Math.log(S.hp / 80) / Math.log(8000 / 80), 0, 1);
    const lpAmt = clamp(Math.log(20000 / S.lp) / Math.log(20000 / 200), 0, 1);
    if (S.hp > 40) { ctx.fillStyle = "rgba(255,70,70,.9)"; ctx.shadowColor = "#ff4646"; ctx.shadowBlur = 10; rr(ctx, cx, fy, (fw / 2) * hpAmt, 10, 4); ctx.fill(); }
    if (S.lp < 18000) { ctx.fillStyle = "rgba(80,150,255,.9)"; ctx.shadowColor = "#5096ff"; ctx.shadowBlur = 10; rr(ctx, cx - (fw / 2) * lpAmt, fy, (fw / 2) * lpAmt, 10, 4); ctx.fill(); }
    ctx.shadowBlur = 0; ctx.fillStyle = "rgba(95,230,255,.5)"; ctx.fillRect(cx - 0.5, fy, 1, 10);
    let fl = "FLAT"; if (S.hp > 40) fl = "HP " + Math.round(S.hp) + " Hz"; else if (S.lp < 18000) fl = "LP " + Math.round(S.lp) + " Hz";
    ctx.fillStyle = "#cdeefb"; ctx.font = "10px Helvetica,Arial"; ctx.fillText("FILTER  " + fl, fx, fy - 3);
    bar(ctx, hx + 16, hy + 108, hw - 32, "ECHO", S.echo / 0.85, "#ff3df0");
    bar(ctx, hx + 16, hy + 132, hw - 32, "DELAY", S.delay / 0.85, "#5fe6ff");
    bar(ctx, hx + 16, hy + 156, hw - 32, "REVERB", S.reverb / 0.75, "#ffd65a");
    bar(ctx, hx + 16, hy + 180, hw - 32, "FLANGER", S.flanger / 0.85, "#9be9ff");
    ctx.fillStyle = rollRef.current.on ? "#ff3df0" : "rgba(255,255,255,.10)"; rr(ctx, hx + 16, hy + 196, 70, 20, 6); ctx.fill();
    ctx.fillStyle = rollRef.current.on ? "#03060c" : "#9fc6d8"; ctx.font = "800 11px Helvetica,Arial";
    ctx.fillText("ROLL " + (rollRef.current.on ? "ON" : "OFF"), hx + 24, hy + 210);
    ctx.restore();

    // legend
    ctx.save(); ctx.fillStyle = "rgba(159,198,216,.75)"; ctx.font = "11px Helvetica,Arial";
    ["RIGHT Y → filter (up=cut bass / down=cut highs)  ·  open R hand → delay",
     "LEFT Y up → reverb  ·  open L hand → echo  ·  hands apart → flanger",
     "fist + fist → ROLL"].forEach((t, i) => ctx.fillText(t, 16, H - 56 + i * 18));
    ctx.restore();
  }

  // ---------- sources ----------
  // play a built-in BLANK SPACE track through the full chain — fully reliable, online-ready, no permissions
  async function startTrack(srcUrl: string) {
    try {
      await Tone.start();
      g.current.baseDry = 1; buildGraph();
      const au = document.createElement("audio"); au.controls = true; au.loop = true; au.src = srcUrl;
      au.style.width = "100%";
      if (playerRef.current) { playerRef.current.innerHTML = ""; playerRef.current.appendChild(au); }
      const src = (g.current.ac as any).createMediaElementSource(au); g.current.srcNode = src;
      Tone.connect(src, g.current.input);
      g.current.dryGain.gain.value = 1;
      await au.play().catch(() => {});
      setPhase("running");
    } catch (e: any) { setErr(e.message || String(e)); }
  }

  async function startFile(file: File) {
    try {
      await Tone.start();
      g.current.baseDry = 1; buildGraph();
      const url = URL.createObjectURL(file); g.current.objectUrl = url;
      const v = document.createElement("video"); v.controls = true; v.loop = true; v.src = url;
      v.style.width = "100%"; v.style.height = "100%";
      if (playerRef.current) { playerRef.current.innerHTML = ""; playerRef.current.appendChild(v); }
      const src = (g.current.ac as any).createMediaElementSource(v); g.current.srcNode = src;
      Tone.connect(src, g.current.input);
      g.current.dryGain.gain.value = 1;
      await v.play().catch(() => {});
      setPhase("running");
    } catch (e: any) { setErr(e.message || String(e)); }
  }
  // Paste a YouTube link → embed + autoplay it in this tab, then capture this tab's audio for the FX.
  async function startYouTube() {
    const id = parseYT(ytUrl);
    if (!id) { setErr("Paste a valid YouTube link."); return; }
    try {
      await Tone.start();
      g.current.baseDry = 0; buildGraph();
      const YT = await loadYTApi();
      if (playerRef.current) {
        playerRef.current.innerHTML = '<div id="yt-holder" style="width:100%;height:100%"></div>';
        g.current.ytPlayer = new YT.Player("yt-holder", {
          videoId: id, width: "100%", height: "100%",
          playerVars: { autoplay: 1, controls: 1, rel: 0, playsinline: 1 },
          events: { onReady: (e: any) => { try { e.target.unMute(); e.target.setVolume(100); e.target.playVideo(); } catch {} } },
        });
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true, preferCurrentTab: true } as any);
      stream.getVideoTracks().forEach((t) => t.stop());
      g.current.stream = stream;
      if (!stream.getAudioTracks().length) {
        stream.getTracks().forEach((t) => t.stop());
        setErr('No tab audio — in the popup turn ON "Also share tab audio" (bottom-left) and pick this tab.');
        return;
      }
      const sink = new Audio(); sink.srcObject = stream; sink.muted = true; sink.play().catch(() => {}); g.current.sink = sink;
      const src = (g.current.ac as any).createMediaStreamSource(stream); g.current.srcNode = src;
      Tone.connect(src, g.current.input);
      g.current.dryGain.gain.value = 0;
      const nudge = (n: number) => {
        const p = g.current.ytPlayer;
        try { p?.unMute?.(); p?.setVolume?.(100); p?.playVideo?.(); } catch {}
        if (n < 16) (g.current.nudgeTimer = setTimeout(() => nudge(n + 1), 250));
      };
      nudge(0);
      setPhase("running");
    } catch (e: any) { setErr("Tab-audio capture failed: " + (e.message || e)); }
  }

  // ---------- loop + lifecycle ----------
  useEffect(() => {
    const cvs = canvasRef.current!, ctx = cvs.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      cvs.width = innerWidth * dpr; cvs.height = innerHeight * dpr;
      cvs.style.width = innerWidth + "px"; cvs.style.height = innerHeight + "px"; // CSS size must match the viewport, or drawing offsets by dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize(); window.addEventListener("resize", resize);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") appView.set("home"); };
    window.addEventListener("keydown", onKey);
    const loop = () => {
      raf.current = requestAnimationFrame(loop);
      classify(); detectRoll(); updateAudio();
      // no-audio watchdog — flags a silent input (the usual YouTube-tab-muted case)
      if (g.current.built && g.current.meter) {
        const v = g.current.meter.getValue();
        const db = typeof v === "number" ? v : -Infinity;
        if (!isFinite(db) || db <= -90) { noAudioRef.current++; if (noAudioRef.current === 90) setNoAudio(true); }
        else if (noAudioRef.current) { noAudioRef.current = 0; setNoAudio(false); }
      }
      render(ctx, innerWidth, innerHeight);
    };
    raf.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf.current);
      clearTimeout(rollRef.current.timer);
      clearTimeout(g.current.nudgeTimer);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      // tear down audio so it stops when we leave the view
      const a = g.current;
      try { a.stream?.getTracks?.().forEach((t: any) => t.stop()); } catch {}
      try { a.ytPlayer?.destroy?.(); } catch {}
      try { a.srcNode?.disconnect?.(); } catch {}
      ["input","hp","lp","splitter","dryGain","echo","echoSend","delay","delaySend","reverb","reverbSend",
       "flanger","flangerSend","rollIn","roll","rollSend","output","meter"].forEach((k) => { try { a[k]?.dispose?.(); } catch {} });
      if (a.objectUrl) try { URL.revokeObjectURL(a.objectUrl); } catch {}
    };
  }, []);

  return (
    <div className="env-full" style={{ background: "transparent", zIndex: 40 }}>
      <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, zIndex: 41, pointerEvents: "none" }} />

      {/* bottom-right player widget */}
      <div ref={playerRef} style={{
        position: "fixed", right: 18, bottom: 18, width: 320, height: 180, zIndex: 44,
        border: "1px solid rgba(95,230,255,.4)", borderRadius: 12, overflow: "hidden", background: "#000",
        boxShadow: "0 0 28px rgba(95,230,255,.25)", display: phase === "running" ? "block" : "none",
      }} />

      {/* exit */}
      <button onClick={() => appView.set("home")} style={{
        position: "fixed", top: 16, right: 16, zIndex: 50, cursor: "pointer", padding: "8px 14px",
        borderRadius: 10, fontWeight: 800, letterSpacing: ".08em", color: "#eaffff",
        background: "rgba(6,14,24,.7)", border: "1px solid rgba(95,230,255,.45)", boxShadow: "0 0 18px rgba(95,230,255,.25)",
      }}>✕ EXIT</button>

      {/* startup overlay */}
      {phase === "start" && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 46, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 24, padding: 24,
          background: "radial-gradient(120% 100% at 50% 30%, rgba(7,20,43,.96), rgba(2,5,12,.98))",
        }}>
          <div style={{ fontSize: 52, fontWeight: 900, letterSpacing: ".16em", color: "#5fe6ff",
            textShadow: "0 0 24px rgba(95,230,255,.8), 0 0 60px rgba(95,230,255,.4)" }}>GESTURE&nbsp;FX</div>
          <div style={{ fontSize: 12, letterSpacing: ".42em", color: "#9fc6d8", marginTop: -12 }}>CDJ-STYLE HAND-CONTROLLED EFFECTS</div>
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap", justifyContent: "center" }}>
            <div style={{ ...panelStyle, borderColor: "rgba(95,230,255,.7)", boxShadow: "0 0 36px rgba(95,230,255,.25)" }}>
              <div style={badgeStyle}>✅ BEST FOR ONLINE</div>
              <h3 style={h3Style}>BLANK SPACE TRACK</h3>
              <p style={pStyle}>DJ over the built-in tracks through the full FX chain — instant, no permissions, works anywhere.</p>
              <select value={trackIdx} onChange={(e) => setTrackIdx(+e.target.value)} style={inputStyle}>
                {tracks.map((t, i) => <option key={i} value={i}>{t.title} · {t.artist}</option>)}
              </select>
              <button onClick={() => startTrack(tracks[trackIdx].src)} style={ctaStyle}>PLAY TRACK</button>
            </div>
            <div style={panelStyle}>
              <div style={badgeStyle}>ALL FX · YOUR FILE</div>
              <h3 style={h3Style}>LOCAL FILE</h3>
              <p style={pStyle}>Pick any audio/video file. It plays through the full FX chain (filter + every effect) — your hands shape it live.</p>
              <input type="file" accept="audio/*,video/*" style={inputStyle}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) startFile(f); }} />
            </div>
            <div style={panelStyle}>
              <div style={badgeStyle}>CHROME / EDGE · YOUTUBE</div>
              <h3 style={h3Style}>YOUTUBE</h3>
              <p style={pStyle}>Paste a link — we embed &amp; auto-play it here, then add your hand FX on top.</p>
              <input type="text" placeholder="https://www.youtube.com/watch?v=..." style={inputStyle}
                value={ytUrl} onChange={(e) => setYtUrl(e.target.value)} />
              <button onClick={startYouTube} style={ctaStyle}>START WITH YOUTUBE</button>
              <div style={{ fontSize: 11, color: "#ffd36e", marginTop: 12, lineHeight: 1.5 }}>
                ⚠ One share popup: turn on <b>“Also share tab audio”</b> &amp; Share — you stay on this tab.
              </div>
            </div>
          </div>
          {err && <div style={{ color: "#ff8080", fontSize: 12 }}>{err}</div>}
        </div>
      )}
      {phase === "running" && (err || noAudio) && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 50, maxWidth: 560, textAlign: "center",
          color: "#ffd36e", fontSize: 12, lineHeight: 1.5, background: "rgba(6,14,24,.86)", padding: "8px 14px", borderRadius: 8,
          border: "1px solid rgba(255,211,106,.4)" }}>
          {err || "No audio reaching the FX. Press ▶ on the player ↘ (and unmute it) — or ✕ EXIT and use a Local File for guaranteed sound + all effects."}
        </div>
      )}
    </div>
  );
}

const panelStyle: React.CSSProperties = { width: 340, background: "linear-gradient(160deg, rgba(14,30,48,.7), rgba(6,12,22,.8))",
  border: "1px solid rgba(95,230,255,.35)", borderRadius: 18, padding: 26, boxShadow: "0 0 30px rgba(95,230,255,.12)" };
const badgeStyle: React.CSSProperties = { display: "inline-block", fontSize: 10, letterSpacing: ".12em", padding: "3px 8px",
  borderRadius: 6, background: "rgba(95,230,255,.14)", border: "1px solid rgba(95,230,255,.4)", color: "#5fe6ff", marginBottom: 8 };
const h3Style: React.CSSProperties = { margin: "0 0 12px", fontSize: 15, letterSpacing: ".14em", color: "#5fe6ff" };
const pStyle: React.CSSProperties = { fontSize: 12, lineHeight: 1.5, color: "#9fc6d8" };
const inputStyle: React.CSSProperties = { width: "100%", padding: 11, borderRadius: 10, marginBottom: 12,
  background: "rgba(0,0,0,.45)", border: "1px solid rgba(95,230,255,.4)", color: "#eaffff", fontSize: 13 };
const ctaStyle: React.CSSProperties = { width: "100%", padding: 12, borderRadius: 10, cursor: "pointer", fontWeight: 800,
  letterSpacing: ".08em", background: "linear-gradient(120deg,#5fe6ff,#2aa8ff)", border: 0, color: "#03121c", fontSize: 13 };
