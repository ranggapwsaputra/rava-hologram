import { Suspense, lazy } from "react";
const Spline = lazy(() => import("@splinetool/react-spline"));

export function SplineScene({ scene, className }: { scene: string; className?: string }) {
  return (
    <Suspense fallback={<div className="w-full h-full grid place-items-center text-cyan-200/60 text-sm tracking-[0.2em]">LOADING 3D…</div>}>
      <Spline scene={scene} className={className} />
    </Suspense>
  );
}
