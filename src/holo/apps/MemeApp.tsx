// MemeApp.tsx — Meme data loader for the 3D Gallery (no card rendering here)
// Fetches up to 9 memes from meme-api.com, writes to memeStore for MemeGallery.tsx

import { useEffect, useState } from "react";
import { memeStore, memeEvents } from "../memeStore";
import type { Meme } from "../memeStore";
import { RefreshCw } from "lucide-react";

const BATCH = 9; // number of memes to pre-load for the gallery

async function fetchMemes(count: number): Promise<Meme[]> {
  const result: Meme[] = [];
  const seen = new Set<string>();

  // Fetch up to count non-duplicate, non-NSFW memes with image URLs
  const attempts = count * 4;
  for (let i = 0; i < attempts && result.length < count; i++) {
    try {
      const r = await fetch("https://meme-api.com/gimme");
      const j = await r.json();
      if (!j?.url || j.nsfw || seen.has(j.url)) continue;
      // Only images (not videos/gifs that fail in img tag)
      if (!j.url.match(/\.(jpe?g|png|webp|gif)(\?|$)/i)) continue;
      // Pre-verify image loads
      await new Promise<void>((res, rej) => {
        const im = new Image();
        im.onload  = () => res();
        im.onerror = () => rej();
        im.src = j.url;
      });
      seen.add(j.url);
      result.push({ url: j.url, title: j.title, subreddit: j.subreddit });
    } catch { /* skip bad images */ }
  }
  return result;
}

export default function MemeApp() {
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [count,    setCount]    = useState(0);

  async function load() {
    setLoading(true); setError(null);
    memeStore.loading = true; memeEvents.emit();
    try {
      const memes = await fetchMemes(BATCH);
      if (memes.length === 0) throw new Error("No memes found");
      memeStore.memes = memes;
      memeStore.loading = false;
      memeEvents.emit();
      setCount(memes.length);
    } catch (e: any) {
      const msg = "Gagal ambil meme. Cek koneksi Om.";
      setError(msg);
      memeStore.loading = false;
      memeEvents.emit();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 400);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line

  // ── Minimal status overlay ─────────────────────────────────────────────────
  return (
    <>
      {/* Loading indicator */}
      {loading && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50, pointerEvents: "none",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ position: "relative", width: 72, height: 72, marginBottom: 16 }}>
            <div style={{
              position: "absolute", inset: 0, borderRadius: "50%",
              border: "2px solid rgba(95,230,255,.18)",
              borderTop: "2px solid #5fe6ff",
              animation: "lspin .8s linear infinite",
            }} />
            <span style={{
              position: "absolute", inset: 0, display: "flex",
              alignItems: "center", justifyContent: "center",
              fontSize: 26,
            }}>😂</span>
          </div>
          <div style={{ fontSize: 10, letterSpacing: ".22em", color: "rgba(95,230,255,.55)", textTransform: "uppercase" }}>
            Memuat Galeri Meme…
          </div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div style={{
          position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
          zIndex: 50, pointerEvents: "auto",
          background: "rgba(248,113,113,.10)", border: "1px solid rgba(248,113,113,.35)",
          borderRadius: 20, padding: "8px 18px",
          color: "#fca5a5", fontSize: 11, letterSpacing: ".08em",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          😢 {error}
          <button onClick={load} style={{
            background: "rgba(248,113,113,.2)", border: "1px solid rgba(248,113,113,.4)",
            borderRadius: 12, padding: "3px 10px", cursor: "pointer", color: "#fca5a5",
            display: "flex", alignItems: "center", gap: 4, fontSize: 10,
          }}>
            <RefreshCw size={10} /> Coba lagi
          </button>
        </div>
      )}

      {/* Loaded badge (top-right, subtle) */}
      {!loading && !error && count > 0 && (
        <div style={{
          position: "fixed", top: 12, right: 60, zIndex: 50, pointerEvents: "auto",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ fontSize: 9, color: "rgba(95,230,255,.35)", fontFamily: "monospace" }}>
            😂 {count} memes
          </span>
          <button onClick={load} title="Refresh gallery" style={{
            background: "transparent", border: "none", cursor: "pointer",
            color: "rgba(95,230,255,.4)", padding: 4, display: "flex",
          }}>
            <RefreshCw size={12} />
          </button>
        </div>
      )}
    </>
  );
}
