import { useEffect, useRef } from "react";
import * as THREE from "three";

interface FloatingParticlesProps {
  particleCount?: number;
  particleColor1?: string;
  particleColor2?: string;
  cameraDistance?: number;
  rotationSpeed?: number;
  particleSize?: number;
  antigravityForce?: number;
  activationRate?: number;
  className?: string;
}

export function FloatingParticles({
  particleCount = 8000,
  particleColor1 = "#9fe9ff",
  particleColor2 = "#b69dff",
  cameraDistance = 1000,
  rotationSpeed = 0.1,
  particleSize = 9,
  antigravityForce = 30,
  activationRate = 50,
  className = "",
}: FloatingParticlesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ref = useRef<any>({});

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth, height = container.clientHeight;

    const ri = (min: number, max: number) => Math.floor(Math.random() * (max - min)) + min;
    const rad = (d: number) => (d * Math.PI) / 180;
    const sph = (r1: number, r2: number, r: number) => [Math.cos(r1) * Math.cos(r2) * r, Math.sin(r1) * r, Math.cos(r1) * Math.sin(r2) * r];

    class Mover {
      position = new THREE.Vector3(); velocity = new THREE.Vector3();
      acceleration = new THREE.Vector3(); mass = 1; is_active = false;
      init(v: THREE.Vector3) { this.position = v.clone(); this.velocity = v.clone(); this.acceleration.set(0, 0, 0); this.is_active = false; }
      updatePosition() { this.position.copy(this.velocity); }
      updateVelocity() { this.acceleration.divideScalar(this.mass); this.velocity.add(this.acceleration); }
      applyForce(v: THREE.Vector3) { this.acceleration.add(v); }
      activate() { this.is_active = true; }
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height); renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x000000, 800, 1600);
    const camera = new THREE.PerspectiveCamera(35, width / height, 1, 10000);
    camera.up.set(0, 1, 0);
    let cr2 = rad(0); const cr1 = rad(90);
    const setCam = () => { const p = sph(cr1, cr2, cameraDistance); camera.position.set(p[0], p[1], p[2]); camera.lookAt(0, 0, 0); };
    setCam();

    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 200;
    const ctx = canvas.getContext("2d")!;
    const grad = ctx.createRadialGradient(100, 100, 0, 100, 100, 100);
    grad.addColorStop(0, "rgba(255,255,255,1)"); grad.addColorStop(0.3, "rgba(255,255,255,0.4)"); grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 200, 200);
    const texture = new THREE.Texture(canvas); texture.needsUpdate = true;

    const movers: Mover[] = [];
    const g1 = new THREE.BufferGeometry(), g2 = new THREE.BufferGeometry();
    const m1 = new THREE.PointsMaterial({ color: particleColor1, size: particleSize, transparent: true, opacity: 0.8, map: texture, depthTest: false, blending: THREE.AdditiveBlending });
    const m2 = new THREE.PointsMaterial({ color: particleColor2, size: particleSize, transparent: true, opacity: 0.8, map: texture, depthTest: false, blending: THREE.AdditiveBlending });
    const p1 = new Float32Array(particleCount * 3), p2 = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const mv = new Mover();
      const range = (Math.log(ri(2, 256)) / Math.log(256)) * 250 + 50;
      const r = rad(ri(0, 360)); const x = Math.cos(r) * range, z = Math.sin(r) * range;
      mv.init(new THREE.Vector3(x, 1000, z)); mv.mass = ri(200, 500) / 100; movers.push(mv);
      const a = i % 2 === 0 ? p1 : p2; a[i * 3] = x; a[i * 3 + 1] = 1000; a[i * 3 + 2] = z;
    }
    g1.setAttribute("position", new THREE.BufferAttribute(p1, 3));
    g2.setAttribute("position", new THREE.BufferAttribute(p2, 3));
    const pts1 = new THREE.Points(g1, m1), pts2 = new THREE.Points(g2, m2);
    scene.add(pts1); scene.add(pts2);

    let last = Date.now();
    const anti = new THREE.Vector3(0, antigravityForce, 0);
    const activate = () => { let c = 0; for (const mv of movers) { if (mv.is_active) continue; mv.activate(); mv.velocity.y = -300; if (++c >= activationRate) break; } };
    const update = () => {
      const a1 = g1.attributes.position.array as Float32Array, a2 = g2.attributes.position.array as Float32Array;
      for (let i = 0; i < movers.length; i++) {
        const mv = movers[i];
        if (mv.is_active) {
          mv.applyForce(anti); mv.updateVelocity(); mv.updatePosition();
          if (mv.position.y > 1000) {
            const range = (Math.log(ri(2, 256)) / Math.log(256)) * 250 + 50;
            const r = rad(ri(0, 360)); mv.init(new THREE.Vector3(Math.cos(r) * range, -300, Math.sin(r) * range)); mv.mass = ri(200, 500) / 100;
          }
        }
        const a = i % 2 === 0 ? a1 : a2; a[i * 3] = mv.position.x; a[i * 3 + 1] = mv.position.y; a[i * 3 + 2] = mv.position.z;
      }
      g1.attributes.position.needsUpdate = true; g2.attributes.position.needsUpdate = true;
    };
    const animate = () => {
      update(); cr2 += rad(rotationSpeed); setCam(); renderer.render(scene, camera);
      if (Date.now() - last > 10) { activate(); last = Date.now(); }
      ref.current.id = requestAnimationFrame(animate);
    };
    const onResize = () => { const w = container.clientWidth, h = container.clientHeight; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); };
    window.addEventListener("resize", onResize);
    animate();

    return () => {
      window.removeEventListener("resize", onResize);
      if (ref.current.id) cancelAnimationFrame(ref.current.id);
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      renderer.dispose(); g1.dispose(); g2.dispose(); m1.dispose(); m2.dispose(); texture.dispose();
    };
  }, [particleCount, particleColor1, particleColor2, cameraDistance, rotationSpeed, particleSize, antigravityForce, activationRate]);

  return <div ref={containerRef} className={`w-full h-full ${className}`} style={{ position: "absolute", inset: 0, overflow: "hidden" }} />;
}
