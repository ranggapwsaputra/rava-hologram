import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { tracks } from "./tracks";
import { hand } from "./handState";
import { rig, player, N, STEP, wrap } from "./store";
import { playTrack } from "./audio";

const R = 5.2;

/** Swipe steps the carousel one card at a time; pointing plays the centered card. */
function Controller() {
  const prevPoint = useRef(false);
  const cooldown = useRef(0);
  useFrame(({ camera }, dt) => {
    cooldown.current -= dt;

    // swipe-to-step: a fast horizontal flick advances exactly one card
    if (hand.present && cooldown.current <= 0 && Math.abs(hand.vx) > 0.045) {
      const dir = hand.vx > 0 ? -1 : 1; // swish right → bring the right-hand card to center
      rig.targetRotY += dir * STEP;
      cooldown.current = 0.4;
    }
    rig.rotY += (rig.targetRotY - rig.rotY) * 0.16;

    // centered card
    let best = 0, bd = 9;
    for (let i = 0; i < N; i++) {
      const d = Math.abs(wrap((i / N) * Math.PI * 2 + rig.targetRotY));
      if (d < bd) { bd = d; best = i; }
    }
    player.focusIndex = best;

    // subtle parallax from hand height
    const targetY = hand.present ? (0.5 - hand.y) * 0.7 : 0;
    camera.position.y += (targetY - camera.position.y) * 0.06;
    camera.lookAt(0, camera.position.y * 0.4, -R);

    // point gesture rising-edge → play centered card
    if (hand.point && !prevPoint.current) {
      player.playingIndex = best;
      playTrack(tracks[best].src);
    }
    prevPoint.current = hand.point;
  });
  return null;
}

function Card({ i }: { i: number }) {
  const group = useRef<THREE.Group>(null);
  const el = useRef<HTMLDivElement>(null);
  const scl = useRef(0.7);
  const base = (i / N) * Math.PI * 2;
  const t = tracks[i];

  useFrame(({ camera }) => {
    const g = group.current;
    if (!g) return;
    const a = base + rig.rotY;
    g.position.set(Math.sin(a) * R, 0, -Math.cos(a) * R);
    g.lookAt(camera.position);
    const focused = player.focusIndex === i;
    const target = focused ? 1.12 : 0.66;
    scl.current += (target - scl.current) * 0.12;
    g.scale.setScalar(scl.current);
    if (el.current) {
      const playing = player.playingIndex === i;
      const want = "holo-card" + (focused ? " focused" : "") + (playing ? " playing" : "");
      if (el.current.className !== want) el.current.className = want;
    }
  });

  return (
    <group ref={group}>
      <Html transform distanceFactor={10} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
        <div ref={el} className="holo-card" style={{ ["--c" as any]: t.color }}>
          <img src={t.art} alt={t.title} draggable={false} />
          <div className="hc-meta">
            <div className="hc-title">{t.title}</div>
            <div className="hc-art">{t.artist}</div>
          </div>
          <div className="hc-eq"><i /><i /><i /></div>
        </div>
      </Html>
    </group>
  );
}

export default function Scene() {
  return (
    <>
      <ambientLight intensity={0.9} />
      <Controller />
      {tracks.map((_, i) => <Card key={i} i={i} />)}
    </>
  );
}
