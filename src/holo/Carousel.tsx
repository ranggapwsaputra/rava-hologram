import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { Music } from "lucide-react";
import { hand, ui } from "./handState";
import { rig, player, wrap } from "./store";
import { fx, startThrow, endThrow } from "./appStore";
import { isPlaying } from "./audio";

const R = 5.2;
const HOLD = 0.85;        // seconds to hold a fist to exit
const POINT_HOLD = 0.4;   // seconds to hold a steady point before it opens (anti-misfire)
const POINT_MAXV = 0.02;  // max hand speed allowed while pointing — above this it reads as a swipe, not a point
const SWIPE_DIST = 0.10;   // net horizontal travel (0..1 of screen) from the anchor to step one card
const SWIPE_RESET = 0.04;  // hand must return within this of the anchor to arm the next flick (kills jitter + recoil double-steps)

// Browsing mechanic: grab-&-spin is the default everywhere. The old swipe is still reachable via ?swipe for comparison.
export const GRAB_NAV = typeof location === "undefined" || !/swipe/i.test(location.search + location.hash + location.pathname);
const GRAB_ON = 0.06;      // pinch tighter than this to grab the wheel
const GRAB_OFF = 0.10;     // release once tips open past this (hysteresis so a drag never drops mid-spin)

export type CarItem =
  | { kind: "track"; title: string; artist: string; art: string; color: string }
  | { kind: "app"; label: string; color: string; Icon: any; soon?: boolean };

function Controller({ count, onSelect, canClose, onClose }: {
  count: number; onSelect: (i: number) => void; canClose: boolean; onClose: () => void;
}) {
  const cd = useRef(0), held = useRef(0), pointHeld = useRef(0), fired = useRef(false);
  const anchorX = useRef(0.5), armed = useRef(true);
  const grabbing = useRef(false), grabX0 = useRef(0), grabRot0 = useRef(0);
  const STEP = (Math.PI * 2) / count;
  const GAIN = 4 * STEP; // dragging a full screen-width spins the wheel ~4 cards
  useFrame(({ camera }, dt) => {
    // hold a fist to exit (deliberate — fills a ring)
    if (canClose && !fx.closing) {
      if (hand.present && hand.grab) {
        held.current += dt; ui.exitProgress = Math.min(1, held.current / HOLD);
        if (held.current >= HOLD) startThrow();
      } else { held.current = 0; ui.exitProgress = 0; }
    }
    cd.current -= dt;
    if (GRAB_NAV) {
      // grab & spin — pinch to grab the wheel, move your hand to drag it, release to snap to the nearest card
      if (!fx.closing && grabbing.current && (!hand.present || hand.pinchDist > GRAB_OFF)) {
        grabbing.current = false;
        rig.targetRotY = Math.round(rig.targetRotY / STEP) * STEP; // snap on release
      } else if (!fx.closing && !grabbing.current && hand.present && hand.pinch && hand.pinchDist < GRAB_ON) {
        grabbing.current = true; grabX0.current = hand.x; grabRot0.current = rig.targetRotY; // grab
      }
      if (grabbing.current) {
        rig.targetRotY = grabRot0.current - (hand.x - grabX0.current) * GAIN;
        pointHeld.current = 0; ui.pointProgress = 0; fired.current = false; // dragging cancels any select charge
      }
    } else if (!fx.closing && hand.present && !hand.grab) {
      // swipe to step — flick past a set distance from an anchor; re-arms when your hand returns toward it.
      // No fast flick needed (anchor stays put while you move, so slow swipes accumulate too), and recoil/jitter
      // can't double-fire because the next step requires returning near the anchor first.
      const dx = hand.x - anchorX.current;
      const speed = Math.hypot(hand.vx, hand.vy);
      if (armed.current && Math.abs(dx) > SWIPE_DIST) {
        rig.targetRotY += (dx > 0 ? -1 : 1) * STEP;
        armed.current = false; cd.current = 0.25;
        pointHeld.current = 0; ui.pointProgress = 0; fired.current = false; // a swipe cancels any select charge
      } else if (!armed.current && Math.abs(dx) < SWIPE_RESET) {
        armed.current = true; anchorX.current = hand.x;       // hand came back → ready for the next flick
      } else if (armed.current && speed < 0.006) {
        anchorX.current += (hand.x - anchorX.current) * 0.08; // recenter the anchor only when the hand is basically still
      }
    } else { armed.current = true; anchorX.current = hand.x; }
    rig.rotY += (rig.targetRotY - rig.rotY) * 0.16;

    let best = 0, bd = 9;
    for (let i = 0; i < count; i++) {
      const d = Math.abs(wrap((i / count) * Math.PI * 2 + rig.targetRotY));
      if (d < bd) { bd = d; best = i; }
    }
    player.focusIndex = best;

    const ty = hand.present ? (0.5 - hand.y) * 0.7 : 0;
    camera.position.y += (ty - camera.position.y) * 0.06;
    camera.lookAt(0, camera.position.y * 0.4, -R);

    // point-to-open: deliberate dwell, ignored while the hand is moving so swipes can never trigger it
    if (!fx.closing) {
      const speed = Math.hypot(hand.vx, hand.vy);
      const steady = hand.present && hand.point && !hand.grab && !hand.pinch && !grabbing.current && speed < POINT_MAXV && cd.current <= 0;
      if (steady) {
        pointHeld.current += dt;
        ui.pointProgress = Math.min(1, pointHeld.current / POINT_HOLD);
        if (pointHeld.current >= POINT_HOLD && !fired.current) { fired.current = true; onSelect(best); }
      } else {
        pointHeld.current = 0; ui.pointProgress = 0; fired.current = false;
      }
    } else if (performance.now() - fx.t0 > 520) {
      endThrow(); ui.exitProgress = 0; onClose();
    }
  });
  return null;
}

function GCard({ i, count, item }: { i: number; count: number; item: CarItem }) {
  const group = useRef<THREE.Group>(null);
  const el = useRef<HTMLDivElement>(null);
  const scl = useRef(0.6);
  const base = (i / count) * Math.PI * 2;

  useFrame(({ camera }) => {
    const g = group.current;
    if (!g) return;
    const a = base + rig.rotY;
    if (fx.closing) {
      const e = Math.min(1, (performance.now() - fx.t0) / 520);
      g.position.set(Math.sin(a) * R, 0, -Math.cos(a) * R);
      g.lookAt(camera.position);
      g.scale.setScalar(Math.max(0.001, (1 - e) * scl.current));
      if (el.current) el.current.style.opacity = String(1 - e);
      return;
    }
    if (el.current && el.current.style.opacity) el.current.style.opacity = "";
    g.position.set(Math.sin(a) * R, 0, -Math.cos(a) * R);
    g.lookAt(camera.position);
    const focused = player.focusIndex === i;
    const target = focused ? 0.82 : 0.46;
    scl.current += (target - scl.current) * 0.12;
    g.scale.setScalar(scl.current);
    if (el.current) {
      const playing = item.kind === "track" && player.playingIndex === i && isPlaying();
      const want = "holo-card" + (item.kind === "app" ? " app" : "") + (focused ? " focused" : "") + (playing ? " playing" : "");
      if (el.current.className !== want) el.current.className = want;
    }
  });

  return (
    <group ref={group}>
      <Html transform distanceFactor={item.kind === "app" ? 8 : 9} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
        {item.kind === "track" ? (
          <div ref={el} className="holo-card" style={{ ["--c" as any]: item.color }}>
            {item.art
              ? <img src={item.art} alt="" draggable={false} />
              : <div className="hc-noart" style={{ background: `linear-gradient(135deg, ${item.color}, #0a1420)` }}><Music size={64} strokeWidth={1.4} /></div>}
            <div className="hc-meta"><div className="hc-title">{item.title}</div><div className="hc-art">{item.artist}</div></div>
            <div className="hc-eq"><i /><i /><i /></div>
          </div>
        ) : (
          <div ref={el} className={"holo-card app" + (item.soon ? " soon" : "")} style={{ ["--c" as any]: item.color }}>
            <div className="app-ic"><item.Icon size={40} strokeWidth={1.6} /></div>
            <div className="app-label">{item.label}</div>
            {item.soon && <div className="app-soon">COMING SOON</div>}
          </div>
        )}
      </Html>
    </group>
  );
}

export default function Carousel({ items, onSelect, canClose = false, onClose = () => {} }: {
  items: CarItem[]; onSelect: (i: number) => void; canClose?: boolean; onClose?: () => void;
}) {
  useEffect(() => { rig.rotY = 0; rig.targetRotY = 0; player.focusIndex = 0; }, []);
  return (
    <>
      <ambientLight intensity={0.9} />
      <Controller count={items.length} onSelect={onSelect} canClose={canClose} onClose={onClose} />
      {items.map((it, i) => <GCard key={i} i={i} count={items.length} item={it} />)}
    </>
  );
}
