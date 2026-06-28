// NewsCarousel.tsx — Floating 3D holographic news carousel (mirrors Carousel.tsx for MusicApp)
// Renders blog-post-card style floating cards inside the R3F Canvas

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { hand, ui } from "../handState";
import { newsRig, newsPlayer, wrapN, accentOfNews, emojiOfNews, fmtDateShort, cleanAnalisa, type NewsItem } from "../newsStore";
import { fx, startThrow, endThrow, appView } from "../appStore";
import { speak } from "../voiceBridge";

// ─── Constants ──────────────────────────────────────────────────────────────
const R = 5.8;                // carousel radius (wider than music for bigger cards)
const HOLD       = 0.85;      // fist-hold seconds to exit
const POINT_HOLD = 0.45;      // point-hold seconds to read article
const POINT_MAXV = 0.018;     // max hand speed while "steady pointing"
const GRAB_ON    = 0.06;
const GRAB_OFF   = 0.10;
const GAIN_MULT  = 3.5;       // drag gain

// ─── Controller (useFrame gesture handler) ──────────────────────────────────
function NewsController({ count, onRead }: { count: number; onRead: (i: number) => void }) {
  const held      = useRef(0);
  const pointHeld = useRef(0);
  const fired     = useRef(false);
  const grabbing  = useRef(false);
  const grabX0    = useRef(0);
  const grabRot0  = useRef(0);
  const STEP = (Math.PI * 2) / count;
  const GAIN = GAIN_MULT * STEP;

  useFrame(({ camera }, dt) => {
    // ── Fist hold → exit ────────────────────────────────────────────────────
    if (!fx.closing) {
      if (hand.present && hand.grab) {
        held.current += dt; ui.exitProgress = Math.min(1, held.current / HOLD);
        if (held.current >= HOLD) startThrow();
      } else { held.current = 0; ui.exitProgress = 0; }
    }

    // ── Pinch-drag to spin ───────────────────────────────────────────────────
    if (!fx.closing && grabbing.current && (!hand.present || hand.pinchDist > GRAB_OFF)) {
      grabbing.current = false;
      newsRig.targetRotY = Math.round(newsRig.targetRotY / STEP) * STEP; // snap
    } else if (!fx.closing && !grabbing.current && hand.present && hand.pinch && hand.pinchDist < GRAB_ON) {
      grabbing.current = true; grabX0.current = hand.x; grabRot0.current = newsRig.targetRotY;
    }
    if (grabbing.current) {
      newsRig.targetRotY = grabRot0.current - (hand.x - grabX0.current) * GAIN;
      pointHeld.current = 0; ui.pointProgress = 0; fired.current = false;
    }

    // ── Smooth rotation lerp ─────────────────────────────────────────────────
    newsRig.rotY += (newsRig.targetRotY - newsRig.rotY) * 0.16;

    // ── Determine focused card ───────────────────────────────────────────────
    let best = 0, bd = 9;
    for (let i = 0; i < count; i++) {
      const d = Math.abs(wrapN((i / count) * Math.PI * 2 + newsRig.targetRotY));
      if (d < bd) { bd = d; best = i; }
    }
    newsPlayer.focusIndex = best;

    // ── Camera follows hand Y ────────────────────────────────────────────────
    const ty = hand.present ? (0.5 - hand.y) * 0.65 : 0;
    camera.position.y += (ty - camera.position.y) * 0.06;
    camera.lookAt(0, camera.position.y * 0.4, -R);

    // ── Point + hold → RAVA reads article ───────────────────────────────────
    if (!fx.closing) {
      const speed = Math.hypot(hand.vx, hand.vy);
      const steady = hand.present && hand.point && !hand.grab && !hand.pinch
        && !grabbing.current && speed < POINT_MAXV;
      if (steady) {
        pointHeld.current += dt;
        ui.pointProgress = Math.min(1, pointHeld.current / POINT_HOLD);
        if (pointHeld.current >= POINT_HOLD && !fired.current) {
          fired.current = true; onRead(best);
        }
      } else {
        pointHeld.current = 0; ui.pointProgress = 0; fired.current = false;
      }
    } else if (performance.now() - fx.t0 > 520) {
      endThrow(); ui.exitProgress = 0; appView.set("home");
    }
  });

  return null;
}

// ─── Single Blog-Post Card ───────────────────────────────────────────────────
function NewsCard3D({ item, i, count }: { item: NewsItem; i: number; count: number }) {
  const group = useRef<THREE.Group>(null);
  const el    = useRef<HTMLDivElement>(null);
  const scl   = useRef(0.5);
  const base  = (i / count) * Math.PI * 2;
  const accent = accentOfNews(item.kategori);

  useFrame(({ camera }) => {
    const g = group.current;
    if (!g) return;
    const a = base + newsRig.rotY;

    // Exit animation
    if (fx.closing) {
      const e = Math.min(1, (performance.now() - fx.t0) / 520);
      g.position.set(Math.sin(a) * R, 0, -Math.cos(a) * R);
      g.lookAt(camera.position);
      g.scale.setScalar(Math.max(0.001, (1 - e) * scl.current));
      if (el.current) el.current.style.opacity = String(1 - e);
      return;
    }
    if (el.current?.style.opacity) el.current.style.opacity = '';

    g.position.set(Math.sin(a) * R, 0, -Math.cos(a) * R);
    g.lookAt(camera.position);

    const focused = newsPlayer.focusIndex === i;
    const target  = focused ? 0.88 : 0.44;
    scl.current  += (target - scl.current) * 0.12;
    g.scale.setScalar(scl.current);

    if (el.current) {
      const want = 'news-card' + (focused ? ' focused' : '');
      if (el.current.className !== want) el.current.className = want;
      el.current.style.setProperty('--c', accent);
    }
  });

  return (
    <group ref={group}>
      <Html transform distanceFactor={9} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div ref={el} className="news-card" style={{ '--c': accent } as React.CSSProperties}>

          {/* ── Header gradient area ── */}
          <div className="nc-header">
            <div className="nc-glow" />
            <span className="nc-badge">
              {emojiOfNews(item.kategori)} {item.kategori}
            </span>
          </div>

          {/* ── Content body ── */}
          <div className="nc-body">
            <h3 className="nc-title">{item.title || '—'}</h3>

            {item.analisa && (
              <p className="nc-excerpt">{cleanAnalisa(item.analisa)}</p>
            )}

            {/* ── Footer meta ── */}
            <div className="nc-meta">
              {item.source && <span>📡 {item.source}</span>}
              {item.savedAt && <span>🕐 {fmtDateShort(item.savedAt)}</span>}
            </div>
          </div>

          {/* ── Scan-line overlay ── */}
          <div className="nc-scan" />
        </div>
      </Html>
    </group>
  );
}

// ─── Main Export ────────────────────────────────────────────────────────────
export default function NewsCarousel({ items }: { items: NewsItem[] }) {
  if (items.length === 0) return null;

  function handleRead(i: number) {
    const item = items[i];
    if (item) speak(`${item.title}. ${cleanAnalisa(item.analisa)}`);
  }

  return (
    <>
      <ambientLight intensity={0.9} />
      <NewsController count={items.length} onRead={handleRead} />
      {items.map((it, i) => (
        <NewsCard3D key={it.id || i} item={it} i={i} count={items.length} />
      ))}
    </>
  );
}
