// NewsApp.tsx — Data loader + Settings overlay for R.A.V.A News Carousel
// Card rendering has moved to NewsCarousel.tsx (floating 3D inside Canvas)

import { useEffect, useState, useCallback } from "react";
import { newsStore, newsEvents } from "../newsStore";
import type { NewsItem } from "../newsStore";
import {
  RefreshCw, Settings, X, Save, Database, AlertCircle, Wifi
} from "lucide-react";

// ─── LocalStorage Keys ───────────────────────────────────────────────────────
const LS_HOST = "rava_pinecone_host";
const LS_KEY  = "rava_pinecone_key";
const LS_NS   = "rava_pinecone_ns";

// ─── Pinecone REST API helpers ───────────────────────────────────────────────
async function pineconeListAll(apiKey: string, host: string, namespace: string): Promise<string[]> {
  const base = host.replace(/\/$/, "");
  const ids: string[] = [];
  let token: string | undefined;
  do {
    const params = new URLSearchParams({ limit: "100" });
    if (namespace) params.set("namespace", namespace);
    if (token) params.set("paginationToken", token);
    const res = await fetch(`${base}/vectors/list?${params}`, {
      headers: { "Api-Key": apiKey, "Accept": "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) { const t = await res.text().catch(() => ""); throw new Error(`List gagal (${res.status}): ${t.slice(0, 120)}`); }
    const data = await res.json();
    const vecs: Array<{ id: string }> = data.vectors ?? [];
    ids.push(...vecs.map(v => v.id));
    token = data.pagination?.next;
  } while (token);
  return ids;
}

async function pineconeFetchBatch(apiKey: string, host: string, namespace: string, ids: string[]): Promise<NewsItem[]> {
  if (ids.length === 0) return [];
  const base = host.replace(/\/$/, "");
  const results: NewsItem[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const params = new URLSearchParams();
    if (namespace) params.set("namespace", namespace);
    batch.forEach(id => params.append("ids", id));
    const res = await fetch(`${base}/vectors/fetch?${params}`, {
      headers: { "Api-Key": apiKey, "Accept": "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) { const t = await res.text().catch(() => ""); throw new Error(`Fetch gagal (${res.status}): ${t.slice(0, 120)}`); }
    const data = await res.json();
    const vectors: Record<string, any> = data.vectors ?? {};
    for (const [id, vec] of Object.entries(vectors)) {
      const m = vec.metadata ?? {};
      const rawText = m.text || m.pageContent || "";
      const parsed = rawText ? parseText(rawText) : { title: m.title || "(no title)", kategori: detectKat(""), analisa: m.analisa || "" };
      results.push({ id, title: parsed.title, kategori: parsed.kategori, analisa: parsed.analisa, link: m.link || m.url || "", pubDate: m.pubDate || m.date || "", source: m.sourceName || "", savedAt: m.savedAt || m.createdAt || "" });
    }
  }
  return results;
}

async function describeStats(apiKey: string, host: string): Promise<Record<string, { vectorCount: number }>> {
  const base = host.replace(/\/$/, "");
  const res = await fetch(`${base}/describe_index_stats`, { method: "POST", headers: { "Api-Key": apiKey, "Accept": "application/json", "Content-Type": "application/json" }, body: JSON.stringify({}), signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Stats gagal (${res.status})`);
  return (await res.json()).namespaces ?? {};
}

async function loadAll(apiKey: string, host: string, namespace: string, onNs?: (ns: string) => void): Promise<NewsItem[]> {
  let ids = await pineconeListAll(apiKey, host, namespace);
  if (ids.length === 0) {
    try {
      const stats = await describeStats(apiKey, host);
      const entries = Object.entries(stats).sort((a, b) => b[1].vectorCount - a[1].vectorCount);
      for (const [ns] of entries) {
        if (ns === namespace) continue;
        const tryIds = await pineconeListAll(apiKey, host, ns);
        if (tryIds.length > 0) { ids = tryIds; namespace = ns; localStorage.setItem(LS_NS, ns); onNs?.(ns); break; }
      }
    } catch { /* ignore */ }
  }
  if (ids.length === 0) return [];
  const items = await pineconeFetchBatch(apiKey, host, namespace, ids);
  return items.sort((a, b) => new Date(b.savedAt || b.pubDate || 0).getTime() - new Date(a.savedAt || a.pubDate || 0).getTime());
}

function parseText(raw: string): { title: string; kategori: string; analisa: string } {
  const katMatch = raw.match(/^\s*\[([^\]]+)\]/);
  const kategori = katMatch ? katMatch[1].trim() : detectKat(raw);
  const withoutKat = raw.replace(/^\s*\[[^\]]+\]\s*/, "");
  const firstLine = withoutKat.split(/\n/)[0];
  const dashMatch = firstLine.match(/^(.+?)\s+-\s+[^-]+?\s*\.?\s*(?:###|📌|$)/);
  let title = dashMatch ? dashMatch[1].trim() : (() => { const dotEnd = firstLine.indexOf(". ###"); const raw2 = dotEnd > 0 ? firstLine.slice(0, dotEnd) : firstLine; const lastDash = raw2.lastIndexOf(" - "); return (lastDash > 15 ? raw2.slice(0, lastDash) : raw2).trim().slice(0, 200); })();
  if (!title) title = firstLine.slice(0, 120).trim();
  const intMatch = raw.match(/📌\s*\*{0,2}Intisari\*{0,2}:?\s*([\s\S]+)/);
  const analisa = intMatch ? intMatch[1].trim().slice(0, 800) : "";
  return { title, kategori, analisa };
}

function detectKat(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("rupiah") || t.includes("kurs") || t.includes("dolar") || t.includes("nilai tukar")) return "NILAI TUKAR";
  if (t.includes("saham") || t.includes("ihsg") || t.includes("idx") || t.includes("tbk") || t.includes("bursa")) return "SAHAM IDX";
  return "BERITA TERKINI";
}

// ─── Component — purely manages credentials + fetch, NO card rendering ───────
export default function NewsApp() {
  const [host,   setHost]   = useState(() => localStorage.getItem(LS_HOST) ?? "");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(LS_KEY)  ?? "");
  const [ns,     setNs]     = useState(() => localStorage.getItem(LS_NS)   ?? "");

  const [showSettings, setShowSettings] = useState(false);
  const [draftHost, setDraftHost] = useState(host);
  const [draftKey,  setDraftKey]  = useState(apiKey);
  const [draftNs,   setDraftNs]   = useState(ns);

  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const hasCredentials = !!(host && apiKey);

  const doLoad = useCallback(async (h: string, k: string, n: string) => {
    if (!h || !k) { setShowSettings(true); return; }
    setLoading(true); setError(null);
    newsStore.loading = true; newsEvents.emit();
    try {
      const items = await loadAll(k, h, n, (detectedNs) => { setNs(detectedNs); });
      newsStore.items = items;
      newsStore.loading = false;
      newsStore.error = null;
      newsEvents.emit();
      setLastSync(new Date().toLocaleTimeString("id-ID"));
    } catch (e: any) {
      const msg = e.message ?? "Gagal terhubung ke Pinecone.";
      setError(msg);
      newsStore.loading = false;
      newsStore.error = msg;
      newsEvents.emit();
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-load on mount
  useEffect(() => {
    const t = setTimeout(() => {
      if (host && apiKey) doLoad(host, apiKey, ns);
      else { setShowSettings(true); }
    }, 600);
    return () => { clearTimeout(t); window.speechSynthesis?.cancel(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function saveSettings() {
    localStorage.setItem(LS_HOST, draftHost.trim());
    localStorage.setItem(LS_KEY,  draftKey.trim());
    localStorage.setItem(LS_NS,   draftNs.trim());
    setHost(draftHost.trim()); setApiKey(draftKey.trim()); setNs(draftNs.trim());
    setShowSettings(false);
    doLoad(draftHost.trim(), draftKey.trim(), draftNs.trim());
  }

  // ── Overlay UI (minimal — settings + status only) ────────────────────────
  return (
    <>
      {/* ── Status bar (top right) ── */}
      <div style={{
        position: "fixed", top: 12, right: 60, zIndex: 50,
        display: "flex", alignItems: "center", gap: 8,
        pointerEvents: "auto",
      }}>
        {/* Loading spinner */}
        {loading && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6, fontSize: 9,
            color: "#5fe6ff", background: "rgba(95,230,255,.08)",
            border: "1px solid rgba(95,230,255,.22)", borderRadius: 20, padding: "3px 10px",
            letterSpacing: ".1em", textTransform: "uppercase",
          }}>
            <RefreshCw size={9} style={{ animation: "lspin .8s linear infinite" }} />
            Memuat…
          </div>
        )}
        {/* Error badge */}
        {!loading && error && (
          <div style={{
            display: "flex", alignItems: "center", gap: 5, fontSize: 9,
            color: "#f87171", background: "rgba(248,113,113,.08)",
            border: "1px solid rgba(248,113,113,.3)", borderRadius: 20, padding: "3px 10px",
            cursor: "pointer",
          }} onClick={() => setShowSettings(true)}>
            <AlertCircle size={9} /> Gagal · klik settings
          </div>
        )}
        {/* Sync time */}
        {!loading && !error && lastSync && (
          <span style={{ fontSize: 9, color: "rgba(95,230,255,.4)", fontFamily: "monospace" }}>
            {lastSync}
          </span>
        )}
        {/* No credentials hint */}
        {!hasCredentials && !showSettings && (
          <div style={{
            display: "flex", alignItems: "center", gap: 5, fontSize: 9,
            color: "#a855f7", background: "rgba(168,85,247,.08)",
            border: "1px solid rgba(168,85,247,.3)", borderRadius: 20, padding: "3px 10px",
          }}>
            <Wifi size={9} /> Setup Pinecone
          </div>
        )}
        {/* Refresh button */}
        <button
          onClick={() => doLoad(host, apiKey, ns)}
          disabled={loading || !hasCredentials}
          title="Refresh"
          style={{
            background: "transparent", border: "none", cursor: loading ? "default" : "pointer",
            color: "rgba(95,230,255,.5)", padding: 4, display: "flex",
          }}
        >
          <RefreshCw size={13} style={{ animation: loading ? "lspin .8s linear infinite" : "none" }} />
        </button>
        {/* Settings button */}
        <button
          onClick={() => { setDraftHost(host); setDraftKey(apiKey); setDraftNs(ns); setShowSettings(true); }}
          title="Settings"
          style={{ background: "transparent", border: "none", cursor: "pointer", color: "rgba(168,85,247,.6)", padding: 4, display: "flex" }}
        >
          <Settings size={13} />
        </button>
      </div>

      {/* ── No data placeholder (shown behind carousel when empty) ── */}
      {!loading && !error && hasCredentials && newsStore.items.length === 0 && (
        <div style={{
          position: "fixed", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", zIndex: 35, pointerEvents: "none",
        }}>
          <Database size={32} style={{ color: "#5fe6ff", opacity: .4, marginBottom: 12 }} />
          <div style={{ fontSize: 10, letterSpacing: ".22em", color: "rgba(95,230,255,.35)", textTransform: "uppercase" }}>
            Tidak ada data
          </div>
        </div>
      )}

      {/* ── Loading placeholder ── */}
      {loading && (
        <div style={{
          position: "fixed", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", zIndex: 35, pointerEvents: "none",
        }}>
          <div style={{ position: "relative", width: 72, height: 72 }}>
            <div style={{
              position: "absolute", inset: 0, borderRadius: "50%",
              border: "2px solid rgba(95,230,255,.18)",
              borderTop: "2px solid #5fe6ff",
              animation: "lspin .8s linear infinite",
            }} />
            <Database size={24} style={{ position: "absolute", inset: 0, margin: "auto", color: "#5fe6ff", opacity: .7 }} />
          </div>
          <div style={{ fontSize: 10, letterSpacing: ".22em", color: "rgba(95,230,255,.55)", textTransform: "uppercase", marginTop: 16 }}>
            Sedang Memuat Berita Terbaru
          </div>
        </div>
      )}

      {/* ── Settings Modal ── */}
      {showSettings && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
          <div style={{
            background: "rgba(6,12,22,0.95)",
            border: "1px solid rgba(95,230,255,.2)",
            borderRadius: 20, padding: "28px 28px 24px",
            width: "100%", maxWidth: 460, maxHeight: "85vh", overflowY: "auto",
            boxShadow: "0 0 60px rgba(0,0,0,.8), 0 0 30px rgba(95,230,255,.08)",
          }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: "#5fe6ff", letterSpacing: ".12em" }}>
                ⚙️ PINECONE SETTINGS
              </div>
              <button onClick={() => setShowSettings(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(200,235,255,.5)", padding: 4 }}>
                <X size={16} />
              </button>
            </div>

            {/* Host */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".18em", color: "rgba(95,230,255,.6)", marginBottom: 6, textTransform: "uppercase" }}>Pinecone Host URL</div>
              <input value={draftHost} onChange={e => setDraftHost(e.target.value)} placeholder="https://my-index-xxxx.svc.pinecone.io"
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: "rgba(95,230,255,.05)", border: "1px solid rgba(95,230,255,.2)", color: "#eaffff", fontSize: 11, fontFamily: "monospace", boxSizing: "border-box" }} />
            </div>
            {/* API Key */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".18em", color: "rgba(95,230,255,.6)", marginBottom: 6, textTransform: "uppercase" }}>API Key</div>
              <input type="password" value={draftKey} onChange={e => setDraftKey(e.target.value)} placeholder="pcsk_..."
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: "rgba(95,230,255,.05)", border: "1px solid rgba(95,230,255,.2)", color: "#eaffff", fontSize: 11, fontFamily: "monospace", boxSizing: "border-box" }} />
            </div>
            {/* Namespace */}
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".18em", color: "rgba(95,230,255,.6)", marginBottom: 6, textTransform: "uppercase" }}>Namespace (opsional)</div>
              <input value={draftNs} onChange={e => setDraftNs(e.target.value)} placeholder="Kosongkan untuk auto-detect"
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: "rgba(95,230,255,.05)", border: "1px solid rgba(95,230,255,.2)", color: "#eaffff", fontSize: 11, fontFamily: "monospace", boxSizing: "border-box" }} />
            </div>

            <button onClick={saveSettings} disabled={!draftHost || !draftKey}
              style={{
                display: "flex", alignItems: "center", gap: 8, justifyContent: "center",
                width: "100%", padding: 12, borderRadius: 10, cursor: (!draftHost || !draftKey) ? "not-allowed" : "pointer",
                background: (!draftHost || !draftKey) ? "rgba(168,85,247,.2)" : "rgba(168,85,247,.25)",
                border: "1px solid rgba(168,85,247,.5)", color: "#e9d5ff", fontWeight: 800, fontSize: 12,
                opacity: (!draftHost || !draftKey) ? 0.4 : 1,
              }}>
              <Save size={14} /> Simpan &amp; Muat Data
            </button>
          </div>
        </div>
      )}
    </>
  );
}
