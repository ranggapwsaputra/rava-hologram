// NewsApp v5 — R.A.V.A Financial Intelligence Center
// ─────────────────────────────────────────────────────────────────────────────
// 📡 Data Source : Pinecone Vector DB (populated by n8n workflow)
// 📰 Kategori    : BERITA TERKINI · SAHAM IDX · NILAI TUKAR
// 🔑 Auth        : Pinecone API Key (stored in localStorage)

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useFistExit } from "../useExit";
import { appView } from "../appStore";
import { hand, ui } from "../handState";
import {
  RefreshCw, Volume2, Newspaper,
  Settings, X, Save, ExternalLink,
  Database, AlertCircle, Wifi
} from "lucide-react";
import { speak } from "../ravaVoice";

// ─── Types ────────────────────────────────────────────────────────────────────
interface PineconeItem {
  id: string;
  title: string;
  kategori: string;
  analisa: string;
  link: string;
  pubDate: string;
  source: string;
  savedAt: string;
}

// ─── Kategori accent colors ──────────────────────────────────────────────────────────────────────────
function accentOf(kategori: string): string {
  if (kategori === "SAHAM IDX")  return "#22c55e";
  if (kategori === "NILAI TUKAR") return "#a855f7";
  return "#f97316"; // BERITA TERKINI
}
function emojiOf(kategori: string): string {
  if (kategori === "SAHAM IDX")  return "📈";
  if (kategori === "NILAI TUKAR") return "💵";
  return "📰";
}

// ─── LocalStorage Keys ────────────────────────────────────────────────────────
const LS_HOST = "rava_pinecone_host";
const LS_KEY  = "rava_pinecone_key";
const LS_NS   = "rava_pinecone_ns";

// ─── Pinecone REST API helpers ────────────────────────────────────────────────
// Uses List + Fetch + DescribeIndexStats — no embedding / OpenAI key needed!

async function pineconeListAll(
  apiKey: string,
  host: string,
  namespace: string
): Promise<string[]> {
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

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Pinecone list gagal (${res.status}): ${errText.slice(0, 120)}`);
    }

    const data = await res.json();
    console.log("[Pinecone List]", JSON.stringify(data).slice(0, 300));
    const vecs: Array<{ id: string }> = data.vectors ?? [];
    ids.push(...vecs.map(v => v.id));
    token = data.pagination?.next;
  } while (token);

  console.log(`[Pinecone List] total IDs found: ${ids.length}`);
  return ids;
}

async function pineconeFetchBatch(
  apiKey: string,
  host: string,
  namespace: string,
  ids: string[]
): Promise<PineconeItem[]> {
  if (ids.length === 0) return [];
  const base = host.replace(/\/$/, "");
  const results: PineconeItem[] = [];

  // Pinecone fetch supports up to ~1000 IDs via query params, batch at 100
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const params = new URLSearchParams();
    if (namespace) params.set("namespace", namespace);
    batch.forEach(id => params.append("ids", id));

    const res = await fetch(`${base}/vectors/fetch?${params}`, {
      headers: { "Api-Key": apiKey, "Accept": "application/json" },
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Pinecone fetch gagal (${res.status}): ${errText.slice(0, 120)}`);
    }

    const data = await res.json();
    const vectors: Record<string, any> = data.vectors ?? {};

    for (const [id, vec] of Object.entries(vectors)) {
      const m = vec.metadata ?? {};
      // Log first item's full metadata for debugging
      if (results.length === 0) console.log("[Pinecone Metadata sample]", JSON.stringify(m));

      // Data disimpan di field 'text' (LangChain pageContent)
      // Format: "[KATEGORI] Title - Source. ### ...\n📌 **Intisari**: analisa"
      const rawText = m.text || m.pageContent || "";
      const parsed = rawText ? parseTextContent(rawText) : {
        title:    m.title    || m.name || "(no title)",
        kategori: m.kategori || detectKategori(""),
        analisa:  m.analisa  || m.description || "",
      };

      results.push({
        id,
        title:    parsed.title,
        kategori: parsed.kategori,
        analisa:  parsed.analisa,
        link:     m.link || m.url || "",
        pubDate:  m.pubDate  || m.date || "",
        source:   m.sourceName || "",
        savedAt:  m.savedAt  || m.createdAt || "",
      });
    }
  }

  return results;
}

// Auto-detect namespace dan load semua items
// Kalau namespace yang disimpan salah → cari otomatis dari describeIndexStats
async function loadAllFromPinecone(
  apiKey: string,
  host: string,
  namespace: string,
  onNamespaceDetected?: (ns: string) => void
): Promise<PineconeItem[]> {
  console.log(`[loadAll] trying namespace="${namespace}"`);
  let ids = await pineconeListAll(apiKey, host, namespace);

  // Kalau 0 hasil, coba auto-detect namespace dari stats
  if (ids.length === 0) {
    console.warn("[loadAll] 0 IDs — auto-detecting namespace...");
    try {
      const stats = await pineconeDescribeStats(apiKey, host);
      const entries = Object.entries(stats).sort((a, b) => b[1].vectorCount - a[1].vectorCount);
      for (const [ns] of entries) {
        if (ns === namespace) continue; // sudah dicoba
        console.log(`[loadAll] trying auto-detected namespace="${ns}"`);
        const tryIds = await pineconeListAll(apiKey, host, ns);
        if (tryIds.length > 0) {
          console.log(`[loadAll] ✅ found ${tryIds.length} IDs in namespace="${ns}" — saving`);
          ids = tryIds;
          namespace = ns;
          // Simpan ke localStorage supaya request berikutnya langsung benar
          localStorage.setItem(LS_NS, ns);
          onNamespaceDetected?.(ns);
          break;
        }
      }
    } catch (e) {
      console.warn("[loadAll] auto-detect gagal:", e);
    }
  }

  if (ids.length === 0) return [];
  const items = await pineconeFetchBatch(apiKey, host, namespace, ids);
  return items.sort((a, b) => {
    const ta = new Date(a.savedAt || a.pubDate || 0).getTime();
    const tb = new Date(b.savedAt || b.pubDate || 0).getTime();
    return tb - ta;
  });
}

// ─── Parser untuk format n8n+LangChain: "[KATEGORI] Title - Source. 📌 Intisari: analisa" ────────
function parseTextContent(raw: string): { title: string; kategori: string; analisa: string } {
  // 1. Extract kategori dari [KATEGORI] di awal teks
  const katMatch = raw.match(/^\s*\[([^\]]+)\]/);
  const kategori = katMatch ? katMatch[1].trim() : detectKategori(raw);

  // 2. Hapus prefix [KATEGORI], sisanya jadi kandidat title + analisa
  const withoutKat = raw.replace(/^\s*\[[^\]]+\]\s*/, "");

  // 3. Title = teks sebelum " - Source", ". ###", ". 📌", atau newline pertama
  //    Contoh: "Ide-ide trading PT Telkom - TradingView. ### ..."
  let title = "";
  const firstLine = withoutKat.split(/\n/)[0];
  // Coba strip " - Source" di akhir
  const dashSourceRx = /^(.+?)\s+-\s+[^-]+?\s*\.?\s*(?:###|📌|$)/;
  const dashMatch = firstLine.match(dashSourceRx);
  if (dashMatch) {
    title = dashMatch[1].trim();
  } else {
    // Hapus bagian setelah " - " terakhir kalau ada (nama sumber)
    const dotEnd = firstLine.indexOf(". ###");
    const rawTitle = dotEnd > 0 ? firstLine.slice(0, dotEnd) : firstLine;
    const lastDash = rawTitle.lastIndexOf(" - ");
    title = (lastDash > 15 ? rawTitle.slice(0, lastDash) : rawTitle).trim().slice(0, 200);
  }
  // Fallback kalau title kosong
  if (!title) title = firstLine.slice(0, 120).trim();

  // 4. Analisa = teks setelah "📌 **Intisari**:" atau "📌 Intisari:"
  const intisariRx = /📌\s*\*{0,2}Intisari\*{0,2}:?\s*([\s\S]+)/;
  const intMatch = raw.match(intisariRx);
  const analisa = intMatch ? intMatch[1].trim().slice(0, 800) : "";

  return { title, kategori, analisa };
}

// Deteksi kategori dari teks jika tidak ada prefix [KATEGORI]
function detectKategori(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("rupiah") || t.includes("kurs") || t.includes("dolar") || t.includes("nilai tukar")) return "NILAI TUKAR";
  if (t.includes("saham") || t.includes("ihsg") || t.includes("idx") || t.includes("tbk") || t.includes("bursa")) return "SAHAM IDX";
  return "BERITA TERKINI";
}

// Diagnosa: tampilkan semua namespace + vector count di index
async function pineconeDescribeStats(
  apiKey: string,
  host: string
): Promise<Record<string, { vectorCount: number }>> {
  const base = host.replace(/\/$/, "");
  const res = await fetch(`${base}/describe_index_stats`, {
    method: "POST",
    headers: { "Api-Key": apiKey, "Accept": "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`describeIndexStats gagal (${res.status}): ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  console.log("[Pinecone Stats]", JSON.stringify(data));
  return data.namespaces ?? {};
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(s: string) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("id-ID", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  } catch {
    return s.slice(0, 16);
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function NewsApp() {
  const recRef = useRef<any>(null);

  useFistExit(() => {
    window.speechSynthesis?.cancel();
    recRef.current?.stop();
    appView.set("home");
  });

  // Credentials — masuk via Settings panel, disimpan ke localStorage
  const [host, setHost]     = useState(() => localStorage.getItem(LS_HOST) ?? "");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(LS_KEY)  ?? "");
  const [ns, setNs]         = useState(() => localStorage.getItem(LS_NS)   ?? "");

  // Settings modal
  const [showSettings, setShowSettings] = useState(false);
  const [draftHost, setDraftHost] = useState(host);
  const [draftKey, setDraftKey] = useState(apiKey);
  const [draftNs, setDraftNs] = useState(ns);
  const [diagResult, setDiagResult] = useState<{
    ok: boolean;
    msg: string;
    namespaces: Array<{ ns: string; count: number }>;
  } | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  async function runDiagnosis() {
    if (!draftHost || !draftKey) return;
    setDiagLoading(true);
    setDiagResult(null);
    try {
      const stats = await pineconeDescribeStats(draftKey, draftHost);
      const entries = Object.entries(stats);
      if (entries.length === 0) {
        setDiagResult({ ok: false, msg: "⚠️ Index kosong — belum ada vector tersimpan.", namespaces: [] });
      } else {
        setDiagResult({
          ok: true,
          msg: `✅ ${entries.reduce((s,[,v]) => s + v.vectorCount, 0)} vectors ditemukan:`,
          namespaces: entries.map(([ns, info]) => ({ ns, count: info.vectorCount })),
        });
      }
    } catch (e: any) {
      setDiagResult({ ok: false, msg: "❌ Error: " + (e.message ?? "Koneksi gagal"), namespaces: [] });
    } finally {
      setDiagLoading(false);
    }
  }

  // Data
  const [allItems, setAllItems] = useState<PineconeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  // Gesture navigation
  const [artIdx, setArtIdx]         = useState(0);
  const [handPos, setHandPos]        = useState<{ x: number; y: number } | null>(null);
  const [pointProg, setPointProg]    = useState(0);
  const artIdxRef  = useRef(0);
  const allItemsRef = useRef<PineconeItem[]>([]);
  const cardRefs   = useRef<(HTMLDivElement | null)[]>([]);
  const scrollRef  = useRef<HTMLDivElement>(null);

  // Kurs Nilai Tukar State
  const [usdRate, setUsdRate] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function fetchUsd() {
      try {
        const res = await fetch("https://open.er-api.com/v6/latest/USD");
        const data = await res.json();
        if (data?.rates?.IDR && active) {
          const val = Math.round(data.rates.IDR).toLocaleString("id-ID");
          setUsdRate(`1 USD = IDR ${val}`);
        }
      } catch (e) {
        console.warn("[USD Rate Fetch Error]", e);
      }
    }
    fetchUsd();
    return () => { active = false; };
  }, []);

  const parsedRate = useMemo(() => {
    if (usdRate) return usdRate;
    const kursItem = allItems.find(i => i.kategori === "NILAI TUKAR" || i.title.toLowerCase().includes("rupiah") || i.title.toLowerCase().includes("kurs"));
    if (kursItem) {
      const match = (kursItem.title + " " + kursItem.analisa).match(/(?:Rp\s*|IDR\s*|Rp\.\s*)([0-9]{2}[.,][0-9]{3})/i);
      if (match) return `1 USD = IDR ${match[1].replace(".", ",")}`;
    }
    return "1 USD = IDR 16.350"; // Clean fallback
  }, [usdRate, allItems]);

  const hasCredentials = !!(host && apiKey);

  // ── Load from Pinecone
  const doLoad = useCallback(async (h: string, k: string, n: string) => {
    if (!h || !k) {
      setShowSettings(true);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      speak("Sedang Memuat Berita Terbaru");
      const items = await loadAllFromPinecone(k, h, n, (detectedNs) => {
        // Auto-detected namespace → update React state juga
        setNs(detectedNs);
        console.log("[doLoad] namespace auto-updated to:", detectedNs);
      });
      setAllItems(items);
      setLastSync(new Date().toLocaleTimeString("id-ID"));
      speak(`${items.length} data intel dimuat dari Pinecone, Om.`);
    } catch (e: any) {
      const msg = e.message ?? "Gagal terhubung ke Pinecone.";
      setError(msg);
      speak("Gagal ambil data dari Pinecone, Om. Cek credentials di settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Sync allItems ke ref (untuk RAF loop tanpa stale closure)
  useEffect(() => { allItemsRef.current = allItems; cardRefs.current = []; }, [allItems]);

  // ── Gesture navigation via hand state (RAF loop, pola sama dengan useExit)
  useEffect(() => {
    const SWIPE_V    = 0.030;  // vertical velocity threshold
    const SWIPE_CD   = 0.55;   // seconds cooldown between swipes
    const POINT_HOLD = 0.55;   // seconds to hold a steady point → RAVA bacakan
    const POINT_MAXV = 0.015;  // max hand speed while pointing (anti-misfire)

    let raf = 0, last = performance.now();
    let cd = 0, pointHeld = 0, pointFired = false;

    const loop = () => {
      const now = performance.now(), dt = (now - last) / 1000; last = now;
      cd -= dt;

      if (hand.present) {
        setHandPos({ x: hand.x, y: hand.y });

        // ── Swipe up → artikel berikutnya; swipe down → sebelumnya
        if (cd <= 0 && !hand.grab) {
          const total = allItemsRef.current.length;
          if (hand.vy < -SWIPE_V && artIdxRef.current < total - 1) {
            artIdxRef.current += 1;
            setArtIdx(artIdxRef.current);
            cd = SWIPE_CD;
            pointHeld = 0; pointFired = false;
          } else if (hand.vy > SWIPE_V && artIdxRef.current > 0) {
            artIdxRef.current -= 1;
            setArtIdx(artIdxRef.current);
            cd = SWIPE_CD;
            pointHeld = 0; pointFired = false;
          }
        }

        // ── Point + hold → RAVA bacakan artikel yang sedang fokus
        const speed = Math.hypot(hand.vx, hand.vy);
        const steady = hand.point && !hand.grab && speed < POINT_MAXV && cd <= 0;
        if (steady) {
          pointHeld += dt;
          const prog = Math.min(1, pointHeld / POINT_HOLD);
          setPointProg(prog); ui.pointProgress = prog;
          if (pointHeld >= POINT_HOLD && !pointFired) {
            pointFired = true;
            const item = allItemsRef.current[artIdxRef.current];
            if (item) speak(`${item.title}. ${item.analisa}`);
          }
        } else {
          pointHeld = 0; pointFired = false;
          setPointProg(0); ui.pointProgress = 0;
        }
      } else {
        setHandPos(null);
        setPointProg(0); ui.pointProgress = 0;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ui.pointProgress = 0; };
  }, []);

  // ── Auto-scroll ke artikel yang sedang fokus
  useEffect(() => {
    const card = cardRefs.current[artIdx];
    if (card) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [artIdx]);

  // ── Initial load on mount
  useEffect(() => {
    const t = setTimeout(() => {
      if (host && apiKey) {
        doLoad(host, apiKey, ns);
      } else {
        speak("Halo Om, setup dulu credentials Pinecone ya biar bisa narik data.");
        setShowSettings(true);
      }
    }, 600);
    return () => {
      clearTimeout(t);
      window.speechSynthesis?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Save settings
  function saveSettings() {
    localStorage.setItem(LS_HOST, draftHost.trim());
    localStorage.setItem(LS_KEY, draftKey.trim());
    localStorage.setItem(LS_NS, draftNs.trim());
    setHost(draftHost.trim());
    setApiKey(draftKey.trim());
    setNs(draftNs.trim());
    setShowSettings(false);
    doLoad(draftHost.trim(), draftKey.trim(), draftNs.trim());
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={BASE}>
      <ExitHint />

      {/* ── Top bar ── */}
      <div style={TOPBAR}>
        {/* Branding & Kurs Nilai Tukar (Pojok Kiri Atas) */}
        <div style={{ flex: 1, padding: "8px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Newspaper size={13} style={{ color: "#5fe6ff", opacity: .7 }} />
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".14em", color: "rgba(200,235,255,.6)", textTransform: "uppercase" }}>
              R.A.V.A Intel Feed
            </span>
          </div>

          {/* Widget Kurs USD -> IDR */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 10, fontWeight: 800, color: "#a855f7",
            background: "rgba(168,85,247,.12)", border: "1px solid rgba(168,85,247,.35)",
            borderRadius: 20, padding: "3px 12px",
            boxShadow: "0 0 12px rgba(168,85,247,.2)",
          }}>
            <span style={{ fontSize: 11 }}>💵</span>
            <span style={{ letterSpacing: ".04em" }}>{parsedRate}</span>
          </div>

          {allItems.length > 0 && (
            <span style={{
              fontSize: 9, fontWeight: 900, borderRadius: 10,
              background: "rgba(95,230,255,.15)", color: "#5fe6ff",
              padding: "1px 7px", lineHeight: "14px",
            }}>
              {allItems.length} item
            </span>
          )}
          {/* Gesture HUD — tampil kalau tangan terdeteksi */}
          {handPos && (
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 9, color: "rgba(95,230,255,.6)",
              background: "rgba(95,230,255,.08)", borderRadius: 20,
              padding: "2px 10px", border: "1px solid rgba(95,230,255,.2)",
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: "#5fe6ff", display: "inline-block",
                boxShadow: "0 0 8px #5fe6ff",
                animation: "holo-pulse 1s ease-in-out infinite",
              }} />
              ✋ Tangan #{artIdx + 1}/{allItems.length}
              {pointProg > 0 && (
                <span style={{ color: "#a855f7" }}>· baca {Math.round(pointProg * 100)}%</span>
              )}
            </div>
          )}
        </div>

        {/* Sync status + controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 10px", flexShrink: 0 }}>
          {lastSync && (
            <span style={{ fontSize: 9, color: "rgba(95,230,255,.45)", fontFamily: "monospace" }}>
              {lastSync}
            </span>
          )}
          <button
            onClick={() => doLoad(host, apiKey, ns)}
            disabled={loading || !hasCredentials}
            title="Refresh data"
            style={iconBtn("#5fe6ff", loading)}
          >
            <RefreshCw size={13} style={{ animation: loading ? "lspin .8s linear infinite" : "none" }} />
          </button>
          <button
            onClick={() => { setDraftHost(host); setDraftKey(apiKey); setDraftNs(ns); setShowSettings(true); }}
            title="Pinecone Settings"
            style={iconBtn("#a855f7")}
          >
            <Settings size={13} />
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>

        {/* Loading state */}
        {loading && (
          <div style={CENTER_WRAP}>
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

        {/* Error state */}
        {!loading && error && (
          <div style={CENTER_WRAP}>
            <AlertCircle size={32} style={{ color: "#f87171", marginBottom: 12 }} />
            <div style={{ fontSize: 12, color: "#fca5a5", textAlign: "center", maxWidth: 380, lineHeight: 1.7, marginBottom: 20 }}>
              {error}
            </div>
            <button onClick={() => doLoad(host, apiKey, ns)} style={actBtn("#f87171")}>
              <RefreshCw size={12} /> Coba Lagi
            </button>
            <button onClick={() => { setDraftHost(host); setDraftKey(apiKey); setDraftNs(ns); setShowSettings(true); }} style={{ ...actBtn("#a855f7"), marginTop: 8 }}>
              <Settings size={12} /> Buka Settings
            </button>
          </div>
        )}

        {/* No credentials */}
        {!loading && !error && !hasCredentials && (
          <div style={CENTER_WRAP}>
            <Wifi size={32} style={{ color: "#a855f7", marginBottom: 12 }} />
            <div style={{ fontSize: 13, color: "rgba(200,235,255,.6)", marginBottom: 20, textAlign: "center", lineHeight: 1.6 }}>
              Setup Pinecone credentials dulu ya Om<br />
              biar RAVA bisa narik data berita.
            </div>
            <button
              onClick={() => { setDraftHost(host); setDraftKey(apiKey); setDraftNs(ns); setShowSettings(true); }}
              style={actBtn("#a855f7")}
            >
              <Settings size={12} /> Buka Settings Pinecone
            </button>
          </div>
        )}

        {/* Data view — semua berita ditampilkan langsung dalam grid 2 kolom (kanan-kiri) */}
        {!loading && !error && hasCredentials && allItems.length > 0 && (
          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "20px 28px 80px", minWidth: 0 }}>
            <div style={{
              maxWidth: 1280, margin: "0 auto",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
              gap: 24, alignItems: "start"
            }}>
              {allItems.map((item, index) => {
                const itemAccent = accentOf(item.kategori);
                const focused = index === artIdx;
                return (
                  <div
                    key={item.id || index}
                    ref={el => { cardRefs.current[index] = el; }}
                    style={{
                      background: focused ? `${itemAccent}0a` : "rgba(255,255,255,.025)",
                      border: `1px solid ${focused ? `${itemAccent}88` : `${itemAccent}33`}`,
                      borderRadius: 16,
                      padding: "20px 24px",
                      boxShadow: focused
                        ? `0 0 32px ${itemAccent}44, 0 4px 24px rgba(0,0,0,0.4), inset 0 0 20px ${itemAccent}0f`
                        : `0 4px 20px rgba(0,0,0,0.3), inset 0 0 15px ${itemAccent}0d`,
                      backdropFilter: "blur(10px)",
                      transition: "all .3s ease",
                      transform: focused ? "scale(1.008)" : "scale(1)",
                    }}
                  >
                    {/* Category badge */}
                    <div style={{
                      marginBottom: 12, display: "inline-flex", alignItems: "center",
                      gap: 6, fontSize: 9, fontWeight: 900, letterSpacing: ".18em",
                      textTransform: "uppercase", color: "#04060c",
                      background: itemAccent, borderRadius: 20,
                      padding: "3px 12px",
                      boxShadow: `0 0 12px ${itemAccent}77`,
                    }}>
                      {emojiOf(item.kategori)} {item.kategori}
                    </div>

                    {/* Title */}
                    <h2 style={{
                      fontSize: "clamp(15px,2vw,20px)", fontWeight: 900, lineHeight: 1.4,
                      color: "#eaffff", margin: "0 0 10px",
                      textShadow: `0 0 18px ${itemAccent}33`,
                    }}>
                      {item.title || "—"}
                    </h2>

                    {/* Meta */}
                    <div style={{ display: "flex", gap: 14, fontSize: 10, color: "rgba(200,235,255,.38)", marginBottom: 14, flexWrap: "wrap" }}>
                      {item.savedAt && <span>🕐 {fmtDate(item.savedAt)}</span>}
                      {item.pubDate && item.pubDate !== item.savedAt && (
                        <span>📅 Publish: {fmtDate(item.pubDate)}</span>
                      )}
                      {item.source && <span>📡 {item.source}</span>}
                      <span style={{ color: "rgba(200,235,255,.2)" }}>#{index + 1}</span>
                    </div>

                    <div style={{ height: 1, background: `linear-gradient(90deg,${itemAccent}44,transparent)`, marginBottom: 16 }} />

                    {/* AI Analysis */}
                    {item.analisa && (
                      <>
                        <div style={{ fontSize: 9, letterSpacing: ".18em", color: `${itemAccent}cc`, textTransform: "uppercase", marginBottom: 8, fontWeight: 900 }}>
                          🤖 Analisa R.A.V.A
                        </div>
                        <p style={{
                          fontSize: "clamp(12px,1.5vw,14px)", color: "rgba(215,238,255,.82)",
                          lineHeight: 1.8, marginBottom: 18,
                          background: "rgba(0,0,0,.2)", borderRadius: 10,
                          padding: "14px 18px", border: `1px solid ${itemAccent}22`,
                        }}>
                          {item.analisa}
                        </p>
                      </>
                    )}

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <button
                        onClick={() => speak(`${item.title}. ${item.analisa}`)}
                        style={actBtn(itemAccent)}
                      >
                        <Volume2 size={13} /> RAVA Bacakan
                      </button>
                      {item.link && (
                        <a href={item.link} target="_blank" rel="noreferrer"
                          style={actBtn(itemAccent) as React.CSSProperties}
                        >
                          <ExternalLink size={13} /> Baca Sumber ↗
                        </a>
                      )}
                    </div>

                    <div style={{ marginTop: 14, fontSize: 9, color: "rgba(200,235,255,.1)", fontFamily: "monospace" }}>
                      id: {item.id}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>{/* ── end main content ── */}

      {/* ── Hand cursor overlay ── */}
      {handPos && (
        <div style={{
          position: "fixed",
          left: `${handPos.x * 100}%`,
          top: `${handPos.y * 100}%`,
          width: 38, height: 38,
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
          zIndex: 200,
        }}>
          {/* SVG progress ring */}
          <svg width="38" height="38" style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
            <circle cx="19" cy="19" r="16" fill="none"
              stroke="rgba(95,230,255,.2)" strokeWidth="2" />
            <circle cx="19" cy="19" r="16" fill="none"
              stroke={pointProg > 0 ? "#a855f7" : "#5fe6ff"}
              strokeWidth="2.5"
              strokeDasharray={`${pointProg * 100.5} 100.5`}
              strokeLinecap="round"
              style={{ transition: "stroke-dasharray .05s, stroke .2s" }}
            />
          </svg>
          {/* Center dot */}
          <div style={{
            position: "absolute", inset: 0, margin: "auto",
            width: 8, height: 8, borderRadius: "50%",
            background: pointProg > 0 ? "#a855f7" : "#5fe6ff",
            boxShadow: `0 0 ${8 + pointProg * 16}px ${pointProg > 0 ? "#a855f7" : "#5fe6ff"}`,
          }} />
        </div>
      )}

      {/* ── Settings Modal ── */}
      {showSettings && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 20,
        }}>
          <div style={{
            background: "rgba(6,12,22,0.95)",
            border: "1px solid rgba(168,85,247,.35)",
            borderRadius: 20, padding: "28px 28px 24px",
            width: "100%", maxWidth: 460,
            boxShadow: "0 0 60px rgba(168,85,247,.15), 0 4px 32px rgba(0,0,0,.6)",
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
              <div>
                <div style={{ fontSize: 9, letterSpacing: ".22em", color: "rgba(168,85,247,.7)", textTransform: "uppercase", marginBottom: 4 }}>
                  R.A.V.A · PINECONE CONFIG
                </div>
                <div style={{ fontSize: 16, fontWeight: 900, color: "#eaffff" }}>
                  Pengaturan Koneksi
                </div>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: 8, cursor: "pointer", color: "#fff" }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Fields */}
            <label style={labelStyle}>
              Index Host URL <span style={{ color: "#f87171" }}>*</span>
            </label>
            <input
              type="text"
              placeholder="https://nama-index-xxxxx.svc.us-east1-gcp.pinecone.io"
              value={draftHost}
              onChange={e => setDraftHost(e.target.value)}
              style={inputStyle}
            />

            <label style={labelStyle}>
              API Key <span style={{ color: "#f87171" }}>*</span>
            </label>
            <input
              type="password"
              placeholder="pcsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={draftKey}
              onChange={e => setDraftKey(e.target.value)}
              style={inputStyle}
            />

            <label style={labelStyle}>
              Namespace <span style={{ color: "rgba(200,235,255,.3)" }}>(opsional)</span>
            </label>
            <input
              type="text"
              placeholder="kosongkan kalau tidak pakai namespace"
              value={draftNs}
              onChange={e => setDraftNs(e.target.value)}
              style={inputStyle}
            />

            <div style={{ fontSize: 10, color: "rgba(200,235,255,.28)", marginBottom: 14, lineHeight: 1.6 }}>
              ℹ️ Credentials disimpan di localStorage browser ini, tidak dikirim ke mana-mana selain ke Pinecone API kamu.
            </div>

            {/* Diagnosa button */}
            <button
              onClick={runDiagnosis}
              disabled={!draftHost || !draftKey || diagLoading}
              style={{
                ...actBtn("#5fe6ff"),
                width: "100%", justifyContent: "center",
                padding: "10px", marginBottom: 10,
                opacity: (!draftHost || !draftKey) ? 0.4 : 1,
                cursor: (!draftHost || !draftKey) ? "not-allowed" : "pointer",
              }}
            >
              <Database size={13} />
              {diagLoading ? "Scanning index…" : "🔍 Diagnosa — Cek Namespace"}
            </button>

            {/* Diagnosa result — clickable namespace list */}
            {diagResult && (
              <div style={{
                background: diagResult.ok ? "rgba(95,230,255,.06)" : "rgba(248,113,113,.06)",
                border: `1px solid ${diagResult.ok ? "rgba(95,230,255,.2)" : "rgba(248,113,113,.2)"}`,
                borderRadius: 8, padding: "10px 12px", marginBottom: 14,
              }}>
                <div style={{ fontSize: 11, color: "rgba(200,235,255,.7)", marginBottom: diagResult.namespaces.length ? 8 : 0 }}>
                  {diagResult.msg}
                </div>
                {diagResult.namespaces.map(({ ns: nsp, count }) => {
                  const isSelected = draftNs === nsp;
                  return (
                    <button
                      key={nsp}
                      onClick={() => {
                        // Fix: don't rely on React state — apply immediately to avoid closure issues
                        setDraftNs(nsp);
                        const h = draftHost.trim();
                        const k = draftKey.trim();
                        localStorage.setItem(LS_HOST, h);
                        localStorage.setItem(LS_KEY, k);
                        localStorage.setItem(LS_NS, nsp);
                        setHost(h); setApiKey(k); setNs(nsp);
                        setShowSettings(false);
                        doLoad(h, k, nsp);
                      }}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        width: "100%", marginBottom: 4, padding: "7px 10px",
                        background: isSelected ? "rgba(95,230,255,.18)" : "rgba(95,230,255,.06)",
                        border: `1px solid ${isSelected ? "rgba(95,230,255,.5)" : "rgba(95,230,255,.2)"}`,
                        borderRadius: 6, cursor: "pointer", gap: 8,
                      }}
                    >
                      <span style={{ fontSize: 10, color: "#5fe6ff", fontFamily: "monospace", textAlign: "left", wordBreak: "break-all" }}>
                        {nsp || "(default — kosong)"}
                      </span>
                      <span style={{ fontSize: 9, color: "rgba(200,235,255,.5)", flexShrink: 0 }}>
                        {count} vec ← Pakai & Muat
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <button
              onClick={saveSettings}
              disabled={!draftHost || !draftKey}
              style={{
                ...actBtn("#a855f7"),
                width: "100%", justifyContent: "center",
                padding: "12px",
                opacity: (!draftHost || !draftKey) ? 0.4 : 1,
                cursor: (!draftHost || !draftKey) ? "not-allowed" : "pointer",
              }}
            >
              <Save size={14} /> Simpan & Muat Data
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function ExitHint() {
  return (
    <div style={{ position: "absolute", top: 12, right: 14, fontSize: 9, color: "rgba(200,235,255,.2)", letterSpacing: ".1em", zIndex: 5, pointerEvents: "none" }}>
      ✊ hold fist to exit
    </div>
  );
}

// ─── Styles & Constants ───────────────────────────────────────────────────────

const BASE: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 30,
  background: "rgba(2,5,12,0.38)",       // lebih transparan → hologram keliatan
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  display: "flex", flexDirection: "column", alignItems: "stretch", overflow: "hidden",
  fontFamily: "inherit",
};

const TOPBAR: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 0,
  borderBottom: "1px solid rgba(95,230,255,.09)",
  flexShrink: 0,
  background: "rgba(0,0,0,0.18)",
  backdropFilter: "blur(8px)",
};

const CENTER_WRAP: React.CSSProperties = {
  flex: 1, display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center", gap: 10,
  padding: 32,
};


const actBtn = (accent: string): React.CSSProperties => ({
  padding: "8px 15px", borderRadius: 8, cursor: "pointer",
  background: `${accent}14`, border: `1px solid ${accent}44`, color: "#eaffff",
  fontSize: 11, fontWeight: 700, letterSpacing: ".04em",
  display: "inline-flex", alignItems: "center", gap: 6,
  textDecoration: "none", transition: "all .15s",
});

const iconBtn = (accent: string, spin = false): React.CSSProperties => ({
  background: "transparent", border: "none", cursor: spin ? "default" : "pointer",
  color: accent, padding: 6, borderRadius: 6, display: "flex", alignItems: "center",
  opacity: spin ? 0.6 : 1, transition: "all .2s",
});

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 10, fontWeight: 700, letterSpacing: ".1em",
  color: "rgba(200,235,255,.5)", textTransform: "uppercase", marginBottom: 6, marginTop: 14,
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.12)",
  color: "#eaffff", fontSize: 12, outline: "none", boxSizing: "border-box",
  fontFamily: "monospace",
};
