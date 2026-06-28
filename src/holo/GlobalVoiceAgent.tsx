// GlobalVoiceAgent — always-on voice control layer.
// Sits at the top of the HoloPlayer tree so it works from any view including the home dashboard.
// Usage: say "buka musik", "chord lab", "gesture", "meme", "jarvis" etc.

import { useEffect, useRef, useState } from "react";
import { appView } from "./appStore";
import { askRava } from "./ravaAi";
import type { ChatMessage } from "./ravaAi";
import { speak } from "./voiceBridge";
import { toggleTrack, pauseTrack, playTrack, isPlaying } from "./audio";
import { tracks } from "./tracks";
import { player, seekCarousel } from "./store";



const SpeechRecognition =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;


function detectCommand(text: string): string | null {
  const q = text.toLowerCase();

  // ── Music playback controls (checked before nav so "putar musik" can be more specific) ──
  // Pause
  if (/pause|berhenti|stop musik|jeda|diam|mute/.test(q)) return "music:pause";
  // Next track
  if (/next|selanjutnya|lagu berikut|skip/.test(q)) return "music:next";
  // Previous track
  if (/prev|sebelumnya|lagu sebelum|back track/.test(q)) return "music:prev";
  // Specific track by artist / title match
  const trackMatch = tryMatchTrack(q);
  if (trackMatch !== null) return `music:track:${trackMatch}`;
  // Generic play / resume
  if (/putar|play|resume|lanjut musik/.test(q)) return "music:play";

  // ── Navigation commands (keyword-based, no AI needed) ──
  if (/buka musik|open musik|open music|aplikasi musik/.test(q)) return "music";
  if (/gesture|gestur|efek suara|air drum/.test(q)) return "gesturefx";
  if (/chord|piano|not|lab/.test(q)) return "chordlab";
  if (/meme|gambar lucu|reddit/.test(q)) return "meme";
  if (/news|berita|baca berita|buka berita/.test(q)) return "news";
  if (/rava|r\.a\.v\.a|robot|asisten/.test(q)) return "robot";
  if (/beranda|home|dasbor|kembali|menu utama/.test(q)) return "home";

  // ── General question / conversation ──
  if (/rava|r\.a\.v\.a/.test(q)) return "ai";

  return null; // not a recognised command — ignore
}

// Fuzzy-match the spoken text against track titles and artists.
// Returns the track index (0-based) if found, or null.
function tryMatchTrack(q: string): number | null {
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    const title = t.title.toLowerCase();
    const artist = t.artist.toLowerCase();
    // Check if any meaningful word from the title/artist appears in q
    const words = [...title.split(/\s+/), ...artist.split(/\s+/)].filter(w => w.length > 2);
    if (words.some(w => q.includes(w))) return i;
  }
  return null;
}

// ─── Music playback command handler ─────────────────────────────────────────
function handleMusicPlayback(cmd: string): { said: string; nav?: string } {
  const currentView = appView.get();

  // music:track:N — play a specific track
  if (cmd.startsWith("music:track:")) {
    const idx = parseInt(cmd.split(":")[2], 10);
    const t = tracks[idx];
    player.playingIndex = idx;
    seekCarousel(idx);
    if (currentView !== "music") {
      setTimeout(() => { toggleTrack(t.src); }, 600);
      return { said: `Memutar ${t.title} oleh ${t.artist}, Om.`, nav: "music" };
    }
    toggleTrack(t.src);
    return { said: `Memutar ${t.title} oleh ${t.artist}, Om.` };
  }

  // music:play — resume current or play first track
  if (cmd === "music:play") {
    if (isPlaying()) return { said: "Musik sudah diputar, Om." };
    const idx = player.playingIndex >= 0 ? player.playingIndex : 0;
    const t = tracks[idx];
    player.playingIndex = idx;
    seekCarousel(idx);
    if (currentView !== "music") {
      setTimeout(() => { playTrack(t.src); }, 600);
      return { said: `Melanjutkan musik, Om.`, nav: "music" };
    }
    playTrack(t.src);
    return { said: "Melanjutkan musik, Om." };
  }

  // music:pause
  if (cmd === "music:pause") {
    pauseTrack();
    return { said: "Musik dijeda, Om." };
  }

  // music:next
  if (cmd === "music:next") {
    const next = (player.playingIndex + 1) % tracks.length;
    player.playingIndex = next;
    seekCarousel(next);
    const t = tracks[next];
    if (currentView !== "music") {
      setTimeout(() => { toggleTrack(t.src); }, 600);
      return { said: `Memutar lagu berikutnya: ${t.title}, Om.`, nav: "music" };
    }
    toggleTrack(t.src);
    return { said: `Memutar lagu berikutnya: ${t.title}, Om.` };
  }

  // music:prev
  if (cmd === "music:prev") {
    const prev = (player.playingIndex - 1 + tracks.length) % tracks.length;
    player.playingIndex = prev;
    seekCarousel(prev);
    const t = tracks[prev];
    if (currentView !== "music") {
      setTimeout(() => { toggleTrack(t.src); }, 600);
      return { said: `Memutar lagu sebelumnya: ${t.title}, Om.`, nav: "music" };
    }
    toggleTrack(t.src);
    return { said: `Memutar lagu sebelumnya: ${t.title}, Om.` };
  }

  return { said: "Perintah musik tidak dikenali, Om." };
}

// ─── TTS helper — imported from ravaVoice (male robot voice)
// speak() is imported from ./ravaVoice above


// ─── Status pill shown on dashboard ─────────────────────────────────────────
type State = "idle" | "listening" | "thinking" | "speaking";

export default function GlobalVoiceAgent({ standbyOnly = false }: { standbyOnly?: boolean } = {}) {
  const recRef = useRef<any>(null);
  const [state, setState] = useState<State>("idle");
  const [transcript, setTranscript] = useState("");
  const historyRef = useRef<ChatMessage[]>([]);
  const listeningRef = useRef(false);
  // AbortController for the in-flight AI request — cancelled when new speech arrives
  const abortRef = useRef<AbortController | null>(null);
  // Guard against overlapping parallel AI calls
  const isProcessingRef = useRef(false);

  const startListening = () => {
    if (!recRef.current || listeningRef.current) return;
    try { recRef.current.start(); } catch (_) { /* already started */ }
  };

  useEffect(() => {
    // In standbyOnly mode: we don't start voice recognition.
    // The component exists so voiceBridge (imported at module level) stays
    // connected and can receive clap_detected events from the Python agent.
    if (standbyOnly) return;
    if (!SpeechRecognition) return;

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "id-ID";
    recRef.current = rec;

    rec.onstart = () => {
      listeningRef.current = true;
      setState("listening");
    };

    rec.onend = () => {
      listeningRef.current = false;
      // Reset to idle if stuck in thinking/speaking (e.g. AI call failed silently)
      setState(s => (s === "listening" || s === "thinking") ? "idle" : s);
      // Keep mic alive
      setTimeout(startListening, 400);
    };

    rec.onerror = (err: any) => {
      listeningRef.current = false;
      // Ignore no-speech errors — they're normal pauses, not real errors
      if (err?.error === "no-speech") {
        setTimeout(startListening, 400);
        return;
      }
      setState("idle");
      isProcessingRef.current = false;
      setTimeout(startListening, 1500);
    };

    rec.onresult = async (e: any) => {
      // With continuous=true, use the latest result index (not always 0)
      const latest = e.results[e.results.length - 1];
      const text: string = latest[0].transcript;
      setTranscript(text);

      const cmd = detectCommand(text);

      // === Music playback commands — instant, no AI needed ===
      if (cmd?.startsWith("music:")) {
        const result = handleMusicPlayback(cmd);
        if (result.nav) appView.set(result.nav as any);
        return;
      }

      // === Direct navigation commands — instant, no AI needed ===
      const navMap: Record<string, string> = {
        music: "music", gesturefx: "gesturefx",
        chordlab: "chordlab", meme: "meme",
        news: "news", robot: "robot", home: "home"
      };
      if (cmd && cmd !== "ai" && navMap[cmd]) {
        appView.set(navMap[cmd] as any);
        return;
      }

      // === ALL other speech → full AI conversation ===
      // Cancel any previous in-flight request before starting a new one
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      // If already processing, skip (prevents rapid-fire overlapping calls)
      if (isProcessingRef.current) return;

      isProcessingRef.current = true;
      setState("thinking");

      const controller = new AbortController();
      abortRef.current = controller;

      const apiKey = localStorage.getItem("gemini_api_key") || localStorage.getItem("openai_api_key") || null;
      const provider = (localStorage.getItem("rava_api_provider") as "gemini" | "openai") || "gemini";

      try {
        const reply = await askRava(text, historyRef.current, apiKey, provider);

        // If aborted while waiting, discard the reply
        if (controller.signal.aborted) {
          isProcessingRef.current = false;
          return;
        }

        // Strip nav tags and apply navigation if present
        const cmdRegex = /\[COMMAND:OPEN_(\w+)\]/;
        const match = reply.match(cmdRegex);
        let cleanReply = reply.replace(cmdRegex, "").trim();
        let navTarget: string | null = null;
        if (match) {
          const t = match[1];
          if (t === "MUSIC") navTarget = "music";
          else if (t === "GESTUREFX") navTarget = "gesturefx";
          else if (t === "CHORDLAB") navTarget = "chordlab";
          else if (t === "MEME") navTarget = "meme";
          else if (t === "NEWS") navTarget = "news";
          else if (t === "HOME") navTarget = "home";
        }

        // Keep short rolling history (last 6 messages)
        historyRef.current = [...historyRef.current, { role: "user" as const, text }, { role: "model" as const, text: cleanReply }].slice(-6);

        setState("speaking");
        speak(cleanReply, () => {
          setState("idle");
          isProcessingRef.current = false;
          if (navTarget) appView.set(navTarget as any);
        });
      } catch {
        if (!controller.signal.aborted) {
          setState("idle");
        }
        isProcessingRef.current = false;
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    };

    // Start listening after a short delay
    setTimeout(startListening, 2000);

    return () => {
      // Cancel any in-flight AI request
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      isProcessingRef.current = false;
      window.speechSynthesis?.cancel();
      try { rec.stop(); } catch (_) { /* noop */ }
    };
  }, [standbyOnly]);

  // In standbyOnly mode, render nothing — just keep voiceBridge mounted
  if (standbyOnly) return null;

  // ─── Mic indicator pill (bottom-center) ─────────────────────────────────
  const colours: Record<State, string> = {
    idle: "rgba(95,230,255,.25)",
    listening: "rgba(95,230,255,.25)",
    thinking: "rgba(182,157,255,.55)",
    speaking: "rgba(255,207,90,.55)",
  };
  const labels: Record<State, string> = {
    idle: "🎙 Mendengarkan…",
    listening: "🎙 Mendengarkan…",
    thinking: "⋯ Memproses",
    speaking: "🔊 RAVA",
  };
  const dotColour: Record<State, string> = {
    idle: "#5fe6ff",
    listening: "#5fe6ff",
    thinking: "#b69dff",
    speaking: "#ffd05a",
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 28,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 55,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 14px",
        borderRadius: 30,
        background: colours[state],
        border: `1px solid ${dotColour[state]}55`,
        backdropFilter: "blur(8px)",
        transition: "background .3s, border-color .3s",
        pointerEvents: "none",
      }}
    >
      {/* Animated dot */}
      <span
        style={{
          width: 7, height: 7, borderRadius: "50%",
          background: dotColour[state],
          boxShadow: `0 0 8px ${dotColour[state]}`,
          animation: (state === "idle" || state === "listening") ? "pulse 2s ease-in-out infinite" : "none",
        }}
      />
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: "#eaffff" }}>
        {labels[state]}
      </span>
      {transcript && state === "listening" && (
        <span style={{ fontSize: 10, color: "#b0e8ff", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          &nbsp;"{transcript}"
        </span>
      )}
    </div>
  );
}
