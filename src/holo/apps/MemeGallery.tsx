// MemeGallery.tsx — 3D Floating Meme Gallery (fixed architecture)
// ✋ Left hand open  = orbit camera (look around)
// 🤏 Right pinch+drag = spin the whole gallery
// 👉 Right point+hold = zoom into hovered card
// ✊ Right fist+hold  = exit to home

import { useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { hand, multiHand, ui } from "../handState";
import { fx, startThrow, endThrow, appView } from "../appStore";
import { memeRig, type Meme } from "../memeStore";
import { X } from "lucide-react";

// ─── Card layout: pushed far back so they read as thumbnails, not billboards ──
// Positions are in the LOCAL space of the rotating GalleryRoot group.
// z = -8…-16  →  at FOV 74 these appear as nicely-sized floating cards.
const SLOTS: [number, number, number][] = [
  [0, 2.2, -10.5],                   // 0 deg (front center, high)
  [6.75, -1.5, -8.04],                // 40 deg (front right, low)
  [9.85, 0.5, -3.42],                 // 80 deg (right side, mid)
  [8.66, 2.5, 5.0],                   // 120 deg (back right, high)
  [3.42, -1.0, 9.4],                  // 160 deg (back center, low)
  [-3.42, 1.8, 9.4],                  // 200 deg (back center, high)
  [-8.66, -2.5, 5.0],                 // 240 deg (back left, low)
  [-9.85, 0.8, -3.42],                // 280 deg (left side, mid)
  [-6.75, -0.5, -8.04],               // 320 deg (front left, mid-low)
];

// Fixed tilt angles applied relative to camera face
const TILTS: [number, number, number][] = [
  [-0.10,  0.20, -0.07],
  [ 0.05, -0.12,  0.10],
  [-0.13,  0.24,  0.08],
  [ 0.16, -0.16, -0.05],
  [-0.07,  0.09,  0.14],
  [ 0.11,  0.21, -0.12],
  [-0.16, -0.09,  0.07],
  [ 0.08,  0.15, -0.09],
  [-0.04, -0.19,  0.11],
];

// ─── Per-hand gesture extractor (raw MediaPipe landmarks) ────────────────────
const ld2 = (a: any, b: any) => Math.hypot(a.x - b.x, a.y - b.y);
const extF = (lm: any, tip: number, pip: number) =>
  ld2(lm[tip], lm[0]) > ld2(lm[pip], lm[0]) * 1.08;

function parseHand(lm: any) {
  if (!lm) return null;
  const idx = extF(lm, 8, 6), mid = extF(lm, 12, 10);
  const rng = extF(lm, 16, 14), pnk = extF(lm, 20, 18);
  const pd = ld2(lm[4], lm[8]);
  return {
    x:    1 - lm[9].x,           // flip to match screen coords
    y:    lm[9].y,
    point: idx && !mid && !rng && !pnk,
    grab:  !idx && !mid && !rng && !pnk,
    open:  idx && mid && rng && pnk,
    pinch: !(!idx && !mid && !rng && !pnk) && pd < 0.06,
    pd,
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────
const HOLD_EXIT  = 0.85;   // seconds fist-hold to exit
const HOLD_ZOOM  = 0.50;   // seconds point-hold to zoom
const GRAB_ON    = 0.06;   // pinchDist threshold to grab
const GRAB_OFF   = 0.10;   // pinchDist threshold to release
const SPIN_GAIN  = Math.PI * 3.5; // drag sensitivity

// ─── StarField (background particles) ────────────────────────────────────────
function StarField() {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(400 * 3);
    for (let i = 0; i < 400; i++) {
      arr[i * 3]     = (Math.random() - 0.5) * 60;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 36;
      arr[i * 3 + 2] = -Math.random() * 24 - 4;
    }
    return arr;
  }, []);

  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.015) * 0.06;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.05} color="#93c5fd" transparent opacity={0.5} sizeAttenuation />
    </points>
  );
}

// ─── Single meme card (child of GalleryRoot group) ────────────────────────────
function MemeCard({ meme, index }: { meme: Meme; index: number }) {
  const gRef  = useRef<THREE.Group>(null);
  const elRef = useRef<HTMLDivElement>(null);
  const scl   = useRef(0.48);
  const wPos  = useRef(new THREE.Vector3()); // reusable world-position vector
  const pos   = SLOTS[index] ?? [0, 0, -10];
  const tilt  = TILTS[index] ?? [0, 0, 0];

  useFrame(({ clock, camera }) => {
    const g = gRef.current;
    if (!g) return;

    // Gentle floating bob in local Y
    const bob = Math.sin(clock.elapsedTime * 0.5 + index * 1.15) * 0.13;
    g.position.set(pos[0], pos[1] + bob, pos[2]);
    
    // Face the camera + apply organic tilt
    g.lookAt(camera.position);
    g.rotateX(tilt[0]);
    g.rotateY(tilt[1]);
    g.rotateZ(tilt[2]);

    // Project WORLD position (parent group may be rotating) to screen
    g.getWorldPosition(wPos.current);
    const proj = wPos.current.clone().project(camera);
    const sx   = (proj.x + 1) / 2;
    const sy   = (1 - proj.y) / 2;
    // Only count if card is visible in front of camera
    if (proj.z < 1) {
      const dist = Math.hypot(sx - hand.x, sy - hand.y);
      if (hand.present && dist < memeRig._bestDist && dist < 0.24) {
        memeRig._bestDist = dist;
        memeRig.hovering  = index;
      }
    }

    // Scale: focused card grows, rest shrink slightly
    const focused   = memeRig.hovering === index;
    const targetScl = focused ? 0.88 : 0.60;
    scl.current    += (targetScl - scl.current) * 0.10;
    g.scale.setScalar(scl.current);

    // Toggle CSS class for glow
    if (elRef.current) {
      const want = 'mc3d' + (focused ? ' hov' : '');
      if (elRef.current.className !== want) elRef.current.className = want;
    }
  });

  return (
    <group ref={gRef}>
      {/* distanceFactor=12 matched to card-size 180px so focused closest card
          fills ~18% of viewport width — thumbnail-gallery proportion.           */}
      <Html transform distanceFactor={12} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div ref={elRef} className="mc3d">
          {meme.url
            ? <img src={meme.url} alt="" className="mc3d-img" draggable={false} />
            : <div className="mc3d-blank" />}
          <div className="mc3d-footer">
            <div className="mc3d-title">{meme.title}</div>
            <div className="mc3d-sub">r/{meme.subreddit}</div>
          </div>
        </div>
      </Html>
    </group>
  );
}

// ─── Gallery root group (rotates) + controller ────────────────────────────────
function GalleryRoot({ memes, onZoom }: { memes: Meme[]; onZoom: (i: number) => void }) {
  const rootRef   = useRef<THREE.Group>(null);
  const fistHeld  = useRef(0);
  const zoomHeld  = useRef(0);
  const zoomFired = useRef(false);
  const grabbing  = useRef(false);
  const grabX0    = useRef(0);
  const grabRot0  = useRef(0);

  useFrame(({ camera }, dt) => {
    // ── Reset hover state so each MemeCard can compete this frame ──────────
    memeRig.hovering  = -1;
    memeRig._bestDist = 9999;

    // ── Apply gallery rotation to root group ───────────────────────────────
    if (rootRef.current) rootRef.current.rotation.y = memeRig.rotY;

    // ── Parse both hands ───────────────────────────────────────────────────
    // Right hand = lower raw-x (user's right → appears left in mirrored cam)
    // Left  hand = higher raw-x
    const sorted  = [...multiHand.list].sort((a, b) => a[9].x - b[9].x);
    const rightH  = parseHand(sorted[0] ?? null);
    const leftH   = parseHand(sorted[1] ?? null);

    // Convenience — fall back to global hand if only 1 hand detected
    const rx      = rightH?.x ?? hand.x;
    const rpd     = rightH?.pd ?? hand.pinchDist;
    const rpinch  = rightH?.pinch ?? hand.pinch;
    const rgrab   = rightH?.grab ?? hand.grab;
    const rpoint  = rightH?.point ?? hand.point;
    const present = multiHand.list.length > 0 || hand.present;

    // ── ✋ Left hand OPEN → orbit camera (look-around) ─────────────────────
    if (leftH?.open) {
      const tx = (leftH.x - 0.5) * 1.2;
      const ty = (0.5 - leftH.y) * 1.0;
      camera.position.x += (tx - camera.position.x) * 0.07;
      camera.position.y += (ty - camera.position.y) * 0.07;
    } else {
      // Gentle drift back to center when no left hand
      camera.position.x += (0 - camera.position.x) * 0.035;
      camera.position.y += (0 - camera.position.y) * 0.035;
    }
    camera.lookAt(0, camera.position.y * 0.2, -10);

    // ── 🤏 Right pinch + drag → spin gallery ──────────────────────────────
    if (!fx.closing) {
      if (grabbing.current && (!present || rpd > GRAB_OFF)) {
        grabbing.current    = false;
        // snap to nearest 30° on release
        const snap = Math.PI / 6;
        memeRig.targetRotY  = Math.round(memeRig.targetRotY / snap) * snap;
      } else if (!grabbing.current && present && rpinch && rpd < GRAB_ON) {
        grabbing.current    = true;
        grabX0.current      = rx;
        grabRot0.current    = memeRig.targetRotY;
      }
      if (grabbing.current) {
        memeRig.targetRotY  = grabRot0.current - (rx - grabX0.current) * SPIN_GAIN;
        zoomHeld.current    = 0;
        ui.pointProgress    = 0;
        zoomFired.current   = false;
      }
    }
    memeRig.rotY += (memeRig.targetRotY - memeRig.rotY) * 0.12;

    // ── ✊ Right fist + hold → exit ────────────────────────────────────────
    if (!fx.closing) {
      if (present && rgrab) {
        fistHeld.current += dt;
        ui.exitProgress   = Math.min(1, fistHeld.current / HOLD_EXIT);
        if (fistHeld.current >= HOLD_EXIT) startThrow();
      } else {
        fistHeld.current = 0;
        ui.exitProgress  = 0;
      }
    } else if (performance.now() - fx.t0 > 520) {
      endThrow(); ui.exitProgress = 0; appView.set("home");
    }

    // ── 👉 Right point + hold → zoom into hovered card ────────────────────
    if (!fx.closing && !grabbing.current) {
      const speed  = Math.hypot(hand.vx, hand.vy);
      const steady = present && rpoint && !rgrab && !rpinch && speed < 0.018;
      if (steady) {
        zoomHeld.current += dt;
        ui.pointProgress  = Math.min(1, zoomHeld.current / HOLD_ZOOM);
        if (zoomHeld.current >= HOLD_ZOOM && !zoomFired.current) {
          zoomFired.current = true;
          if (memeRig.hovering >= 0) onZoom(memeRig.hovering);
        }
      } else {
        zoomHeld.current = 0;
        ui.pointProgress = 0;
        zoomFired.current = false;
      }
    }
  });

  return (
    <group ref={rootRef}>
      {memes.slice(0, SLOTS.length).map((m, i) => (
        <MemeCard key={i} meme={m} index={i} />
      ))}
    </group>
  );
}

// ─── Full-screen zoom overlay via React Portal ───────────────────────────────
function ZoomedOverlay({ meme, onClose }: { meme: Meme; onClose: () => void }) {
  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(2, 5, 12, 0.94)",
        backdropFilter: "blur(16px)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        cursor: "pointer",
      }}
      onClick={onClose}
    >
      {/* Glow ring behind image */}
      <div style={{
        position: "absolute", inset: "10%",
        background: "radial-gradient(ellipse at center, rgba(95,230,255,.06) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <img
        src={meme.url} alt={meme.title}
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: "82vw", maxHeight: "75vh",
          borderRadius: 18, display: "block",
          boxShadow: "0 0 0 1.5px rgba(95,230,255,.3), 0 0 60px rgba(95,230,255,.18), 0 30px 80px rgba(0,0,0,.75)",
          objectFit: "contain",
          animation: "mcZoomIn .28s cubic-bezier(.16,1,.3,1) both",
        }}
        draggable={false}
      />

      <div style={{
        marginTop: 20, textAlign: "center",
        color: "#eaffff", fontSize: 15, fontWeight: 800, maxWidth: "70vw",
        lineHeight: 1.4,
        textShadow: "0 0 24px rgba(95,230,255,.35)",
      }}>
        {meme.title}
      </div>
      <div style={{ marginTop: 5, fontSize: 11, color: "rgba(200,235,255,.4)", letterSpacing: ".06em" }}>
        r/{meme.subreddit}
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: "absolute", top: 20, right: 20,
          width: 44, height: 44, borderRadius: "50%",
          background: "rgba(95,230,255,.10)", border: "1px solid rgba(95,230,255,.3)",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", color: "#5fe6ff", boxShadow: "0 0 18px rgba(95,230,255,.2)",
          transition: "background .15s",
        }}
      >
        <X size={18} />
      </button>

      <div style={{
        position: "absolute", bottom: 24,
        fontSize: 9, color: "rgba(95,230,255,.28)",
        letterSpacing: ".18em", textTransform: "uppercase",
        pointerEvents: "none",
      }}>
        ✊ hold fist · tap anywhere to close
      </div>
    </div>,
    document.body
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────
export default function MemeGallery({ memes }: { memes: Meme[] }) {
  const [zoomedIdx, setZoomedIdx] = useState(-1);
  const count = Math.min(memes.length, SLOTS.length);
  if (count === 0) return null;

  return (
    <>
      <ambientLight intensity={0.6} />
      <StarField />
      <GalleryRoot
        memes={memes.slice(0, count)}
        onZoom={(i) => { setZoomedIdx(i); ui.pointProgress = 0; }}
      />
      {zoomedIdx >= 0 && memes[zoomedIdx] && (
        <ZoomedOverlay meme={memes[zoomedIdx]} onClose={() => setZoomedIdx(-1)} />
      )}
    </>
  );
}
