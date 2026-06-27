import { useEffect, useRef, useState } from "react";
import { hand } from "../handState";
import { useFistExit } from "../useExit";
import { appView } from "../appStore";

type Meme = { url: string; title: string; subreddit: string };

// Pulls a random meme from meme-api.com (a CORS-enabled Reddit meme API). Point & hold or click for the next one.
export default function MemeApp() {
  useFistExit(() => appView.set("home"));
  const [meme, setMeme] = useState<Meme | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const busy = useRef(false);

  async function fetchMeme() {
    if (busy.current) return;
    busy.current = true; setLoading(true); setErr(null);
    try {
      let m: any = null;
      for (let t = 0; t < 4; t++) {
        const r = await fetch("https://meme-api.com/gimme");
        const j = await r.json();
        if (j && j.url && !j.nsfw) { m = j; break; }
      }
      if (!m) throw new Error("none");
      await new Promise<void>((res, rej) => { const im = new Image(); im.onload = () => res(); im.onerror = () => rej(new Error("img")); im.src = m.url; });
      setMeme({ url: m.url, title: m.title, subreddit: m.subreddit });
    } catch { setErr("Couldn't load a meme — try again."); }
    finally { setLoading(false); busy.current = false; }
  }

  useEffect(() => { fetchMeme(); }, []);

  // 👉 point & hold ~0.7s → next meme
  useEffect(() => {
    let raf = 0, held = 0, last = performance.now(), fired = false;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now(), dt = (now - last) / 1000; last = now;
      if (hand.present && hand.point && Math.hypot(hand.vx, hand.vy) < 0.02) {
        held += dt; if (held >= 0.7 && !fired) { fired = true; fetchMeme(); }
      } else { held = 0; fired = false; }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="env-full meme">
      <div className="meme-frame">
        {meme && <img src={meme.url} alt="" className="meme-img" draggable={false} />}
        {loading && <div className="meme-load">LOADING MEME…</div>}
        {err && !loading && <div className="meme-load">{err}</div>}
      </div>
      {meme && !loading && (
        <div className="meme-meta"><b>{meme.title}</b><span>r/{meme.subreddit}</span></div>
      )}
      <div className="env-cap">MEME OF THE DAY</div>
      <button className="meme-next" onClick={fetchMeme}>⟳ NEW MEME</button>
      <div className="env-exit">👉 point &amp; hold for next · ✊ hold a fist to exit</div>
    </div>
  );
}
