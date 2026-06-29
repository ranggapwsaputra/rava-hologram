/**
 * voiceBridge.ts — R.A.V.A TTS bridge to the Python ElevenLabs voice agent.
 *
 * Connects to ws://localhost:7788 (the jarvis.py WebSocket server) and routes
 * all speak() calls through ElevenLabs for high-quality, premium voice output.
 *
 * Fallback: if the WebSocket is not available (agent offline), automatically
 * falls back to the built-in browser Web Speech Synthesis API.
 *
 * API is fully compatible with the old ravaVoice.ts — just swap the import.
 *
 * Usage:
 *   import { speak, cancel } from "./voiceBridge";
 *   speak("Selamat datang, Om.", () => console.log("done"));
 */

// ─── Config ──────────────────────────────────────────────────────────────────

const WS_URL = "ws://127.0.0.1:7788";
const RECONNECT_DELAY_MS = 800;    // wait before retry after disconnect
const CONNECT_TIMEOUT_MS = 1500;   // if no "ready" within this time, use fallback

// ─── State ───────────────────────────────────────────────────────────────────

type WsState = "connecting" | "ready" | "disconnected";

let ws: WebSocket | null = null;
let wsState: WsState = "disconnected";
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

/** Subscribers notified when wsState changes. */
type StatusListener = (s: WsState) => void;
const statusListeners = new Set<StatusListener>();
function _setWsState(s: WsState) {
  wsState = s;
  statusListeners.forEach(fn => fn(s));
}

/** Queue of pending speak requests waiting for WS to be ready. */
const pendingQueue: Array<{ text: string; onEnd?: () => void }> = [];

/** Callback set for the currently in-flight speak request. */
let currentOnEnd: (() => void) | null = null;

// ─── WebSocket lifecycle ──────────────────────────────────────────────────────

// ─── IMPORTANT: Auto-connect on module load so clap events are received even ─
// ─── in Standby Mode (before speak() is ever called). ────────────────────────

type ClapListener = () => void;
const clapListeners = new Set<ClapListener>();

/**
 * Register a listener to be notified when a double-clap is detected by the Python voice agent.
 */
export function onClap(callback: ClapListener): () => void {
  clapListeners.add(callback);
  return () => { clapListeners.delete(callback); };
}

/**
 * Subscribe to WebSocket connection status changes.
 * Fires immediately with the current state, then on every change.
 */
export function onStatusChange(callback: StatusListener): () => void {
  statusListeners.add(callback);
  callback(wsState); // fire immediately with current state
  return () => { statusListeners.delete(callback); };
}

function connect(): void {
  if (ws && ws.readyState <= WebSocket.OPEN) return; // already connecting/open

  wsState = "connecting";
  _setWsState("connecting");
  console.info(`[voiceBridge] Connecting to R.A.V.A Voice Agent at ${WS_URL}...`);
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.info("[voiceBridge] WebSocket connected, waiting for ready handshake...");
  };

  ws.onmessage = (event: MessageEvent) => {
    let msg: { status?: string; text?: string; message?: string };
    try {
      msg = JSON.parse(event.data as string);
    } catch {
      return;
    }

    switch (msg.status) {
      case "ready":
        _setWsState("ready");
        console.info("[voiceBridge] R.A.V.A Voice Agent is ready to play premium TTS!");
        // Drain any queued speak requests
        _drainQueue();
        break;

      case "clap_detected":
        console.info("[voiceBridge] Acoustic double-clap trigger detected! Notifying", clapListeners.size, "listener(s).");
        clapListeners.forEach(cb => cb());
        break;

      case "speaking":
        // Acknowledged — playback started on the Python side
        break;

      case "done":
        // Playback finished — fire the callback
        if (currentOnEnd) {
          const cb = currentOnEnd;
          currentOnEnd = null;
          cb();
        }
        // Process next in queue if any
        _drainQueue();
        break;

      case "error":
        console.warn("[voiceBridge] Agent error:", msg.message);
        if (currentOnEnd) {
          const cb = currentOnEnd;
          currentOnEnd = null;
          cb(); // don't block the caller
        }
        break;
    }
  };

  ws.onclose = () => {
    console.warn("[voiceBridge] WebSocket disconnected. Premium TTS offline.");
    _setWsState("disconnected");
    ws = null;
    // Fire any pending callbacks so callers aren't stuck
    _flushQueueOnDisconnect();
    // Schedule reconnect
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, RECONNECT_DELAY_MS);
    }
  };

  ws.onerror = (err) => {
    console.error("[voiceBridge] WebSocket connection error:", err);
  };
}

function _drainQueue(): void {
  if (wsState !== "ready" || !ws || ws.readyState !== WebSocket.OPEN) return;
  if (currentOnEnd) return; // one in flight at a time
  const next = pendingQueue.shift();
  if (!next) return;
  currentOnEnd = next.onEnd ?? null;
  ws.send(JSON.stringify({ action: "speak", text: next.text }));
}

function _flushQueueOnDisconnect(): void {
  // Drain queue with fallback TTS so callers aren't frozen
  if (currentOnEnd) {
    const cb = currentOnEnd;
    currentOnEnd = null;
    cb();
  }
  while (pendingQueue.length > 0) {
    const item = pendingQueue.shift()!;
    _browserFallbackSpeak(item.text, item.onEnd);
  }
}

// Start connecting immediately when the module loads
connect();

// Debug helper — lets HoloPlayer log how many clap listeners are registered
(window as any).__ravaClapDebug = () => clapListeners.size;

// ─── Browser Speech Synthesis fallback ───────────────────────────────────────

function _pickFallbackVoice(): SpeechSynthesisVoice | null {
  const all = window.speechSynthesis?.getVoices() ?? [];
  if (!all.length) return null;
  const isId = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().startsWith("id");
  const isEn = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().startsWith("en");
  const isMale = (v: SpeechSynthesisVoice) => {
    const n = v.name.toLowerCase();
    return /\b(male|man|david|mark|james|thomas|daniel|evan|aaron|fred|alex|google uk english male|google us english|microsoft david|andika|arief)\b/.test(n)
      && !/female|woman|zira|hazel|victoria|karen|tessa|moira|fiona|ava|samantha|siri/i.test(n);
  };
  return (
    all.find(v => isId(v) && isMale(v)) ||
    all.find(v => isId(v)) ||
    all.find(v => isEn(v) && isMale(v)) ||
    all.find(v => isMale(v)) ||
    all[0]
  );
}

function _browserFallbackSpeak(
  text: string,
  onEnd?: () => void,
  opts: { pitch?: number; rate?: number } = {}
): void {
  if (!window.speechSynthesis) { onEnd?.(); return; }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang  = "id-ID";
  u.pitch = opts.pitch ?? 0.72;
  u.rate  = opts.rate  ?? 0.92;
  const trySpeak = () => {
    const voice = _pickFallbackVoice();
    if (voice) u.voice = voice;
    u.onend   = () => onEnd?.();
    u.onerror = () => onEnd?.();
    window.speechSynthesis.speak(u);
  };
  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      trySpeak();
    };
  } else {
    trySpeak();
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Speak `text` via ElevenLabs (through the Python jarvis.py agent).
 * Falls back to browser TTS if the agent is not running.
 *
 * @param text   Text to speak.
 * @param onEnd  Optional callback fired after playback completes.
 * @param opts   Fallback pitch/rate (only used when browser TTS kicks in).
 */
export function speak(
  text: string,
  onEnd?: () => void,
  opts: { pitch?: number; rate?: number } = {}
): void {
  const clean = text.trim();
  if (!clean) { onEnd?.(); return; }

  // Ensure connected (handles reconnect after the auto-connect was dropped)
  if (wsState === "disconnected") connect();

  if (wsState === "ready" && ws && ws.readyState === WebSocket.OPEN) {
    // WebSocket is live — queue the speak request
    pendingQueue.push({ text: clean, onEnd });
    _drainQueue();
    return;
  }

  if (wsState === "connecting") {
    // Wait up to CONNECT_TIMEOUT_MS for WS; otherwise use fallback
    const deadline = Date.now() + CONNECT_TIMEOUT_MS;
    const poll = () => {
      if (wsState === "ready" && ws && ws.readyState === WebSocket.OPEN) {
        pendingQueue.push({ text: clean, onEnd });
        _drainQueue();
      } else if (Date.now() < deadline) {
        setTimeout(poll, 100);
      } else {
        // Timed out — use browser fallback
        console.info("[voiceBridge] Agent not ready — using browser TTS fallback.");
        _browserFallbackSpeak(clean, onEnd, opts);
      }
    };
    setTimeout(poll, 100);
    return;
  }

  // Disconnected — use browser fallback immediately
  console.info("[voiceBridge] Agent offline — using browser TTS fallback.");
  _browserFallbackSpeak(clean, onEnd, opts);
}

/**
 * Cancel any ongoing speech (both ElevenLabs and browser TTS).
 */
export function cancel(): void {
  window.speechSynthesis?.cancel();
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: "cancel" }));
  }
  if (currentOnEnd) {
    const cb = currentOnEnd;
    currentOnEnd = null;
    cb();
  }
}

/**
 * Returns the current connection status of the voice bridge.
 */
export function bridgeStatus(): WsState {
  return wsState;
}

// ─── Module-level auto-connect ────────────────────────────────────────────────
// Note: connect() is already called at line 173 when the module loads.
// A second call here is intentionally removed to prevent race conditions.
