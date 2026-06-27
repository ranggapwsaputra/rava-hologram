import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { hand } from "../handState";
import { fx, startThrow, endThrow, appView } from "../appStore";

export default function StubApp({ title, color, children }: { title: string; color: string; children?: any }) {
  const g = useRef<THREE.Group>(null);
  const el = useRef<HTMLDivElement>(null);

  useFrame(({ camera }) => {
    const o = g.current;
    if (!o) return;
    if (fx.closing) {
      const e = Math.min(1, (performance.now() - fx.t0) / 640);
      o.position.set(0, e * e * 11, -4.6);
      o.lookAt(camera.position);
      o.scale.setScalar(Math.max(0.001, 1 - e));
      if (el.current) el.current.style.opacity = String(1 - e);
      if (performance.now() - fx.t0 > 640) { endThrow(); appView.set("home"); }
      return;
    }
    if (el.current && el.current.style.opacity) el.current.style.opacity = "";
    o.position.set(0, 0, -4.6);
    o.lookAt(camera.position);
    // throw UP to exit
    if (hand.present && hand.vy < -0.05 && Math.abs(hand.vy) > Math.abs(hand.vx) * 1.2) startThrow();
  });

  return (
    <>
      <ambientLight intensity={0.9} />
      <group ref={g}>
        <Html transform distanceFactor={28} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
          <div ref={el} className="holo-panel" style={{ ["--c" as any]: color }}>
            <div className="hp-title">{title}</div>
            <div className="hp-body">{children}</div>
            <div className="hp-hint">↑ throw up to exit</div>
          </div>
        </Html>
      </group>
    </>
  );
}
