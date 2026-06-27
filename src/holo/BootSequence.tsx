import { useEffect, useRef } from "react";
import { blip } from "./boot";

const LINES = ["INITIALIZING BLANK SPACE OS", "CALIBRATING HAND-TRACK", "LINKING NEURAL CORE", "◉ ALL SYSTEMS ONLINE"];

export default function BootSequence({ onDone }: { onDone: () => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timers: any[] = [];
    LINES.forEach((_, idx) => {
      timers.push(setTimeout(() => {
        const el = listRef.current?.children[idx] as HTMLElement | undefined;
        if (el) el.classList.add("on");
        blip(680 + idx * 130);
      }, 450 + idx * 460));
    });
    timers.push(setTimeout(onDone, 450 + LINES.length * 460 + 550));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="boot">
      <div className="reactor-boot"><span /><span /><span /><i /></div>
      <div className="boot-lines" ref={listRef}>{LINES.map((l, i) => <div key={i} className="bl">{l}</div>)}</div>
    </div>
  );
}
