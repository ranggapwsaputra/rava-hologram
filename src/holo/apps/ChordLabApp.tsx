import { useEffect, useRef } from "react";
import * as Tone from "tone";
import { multiHand } from "../handState";
import { appView } from "../appStore";
import { useFistExit } from "../useExit";

// ===== Chord Lab — hand-controlled piano chords, native in the holo (reuses the shared 2-hand tracker) =====
const ROOTS = ["OFF","C","D","E","F","G","A","B"];
const SCALE = [null,0,2,4,5,7,9,11];
const QUAL = [
  { name:"OFF",  sym:null,   iv:null },
  { name:"maj",  sym:"",     iv:[0,4,7] },
  { name:"min",  sym:"m",    iv:[0,3,7] },
  { name:"7",    sym:"7",    iv:[0,4,7,10] },
  { name:"maj7", sym:"maj7", iv:[0,4,7,11] },
  { name:"min7", sym:"m7",   iv:[0,3,7,10] },
  { name:"dim",  sym:"dim",  iv:[0,3,6] },
  { name:"sus4", sym:"sus4", iv:[0,5,7] },
  { name:"aug",  sym:"aug",  iv:[0,4,8] },
];
const TWO_PI = Math.PI*2, START = -Math.PI/2;
const HC: [number,number][] = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
const TIPS = [4,8,12,16,20];
const d2 = (a:any,b:any)=>Math.hypot(a.x-b.x, a.y-b.y);

export default function ChordLabApp() {
  useFistExit(() => appView.set("home")); // ✊ hold a fist to exit, like the other apps (distinct from pinch-to-play)
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const g = useRef<any>({});
  const st = useRef({
    liveRoot:0, liveQual:0, rootSel:{seg:0,cand:0,t:0}, qualSel:{seg:0,cand:0,t:0},
    shL:{x:0,y:0,on:false}, shR:{x:0,y:0,on:false}, prevPinch:false, transpose:0,
  });
  const raf = useRef(0);

  function buildAudio() {
    const reverb = new Tone.Reverb({ decay:3, wet:0.22 }).toDestination();
    const synth = new Tone.Sampler({
      urls:{ "C3":"C3.mp3","D#3":"Ds3.mp3","F#3":"Fs3.mp3","A3":"A3.mp3",
             "C4":"C4.mp3","D#4":"Ds4.mp3","F#4":"Fs4.mp3","A4":"A4.mp3","C5":"C5.mp3" },
      baseUrl:"https://tonejs.github.io/audio/salamander/", release:1.2,
    }).connect(reverb);
    g.current = { reverb, synth };
  }
  function chordNotes(ri:number, qi:number) {
    if (SCALE[ri]==null || !QUAL[qi].iv) return [];
    const base = 60 + (SCALE[ri] as number) + st.current.transpose;
    return (QUAL[qi].iv as number[]).map(iv => Tone.Frequency(base+iv,"midi").toNote());
  }
  function strum(ri:number, qi:number) {
    const s = g.current.synth; if (!s || !s.loaded) return;
    const notes = chordNotes(ri,qi); if (!notes.length) return;
    s.releaseAll(); s.triggerAttack(notes);
  }
  // keyboard: transpose + esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const S = st.current;
      if (e.key==="Escape") appView.set("home");
      else if (e.key==="ArrowUp") S.transpose=Math.min(24,S.transpose+12);
      else if (e.key==="ArrowDown") S.transpose=Math.max(-24,S.transpose-12);
      else if (e.key==="]"||e.key==="=") S.transpose=Math.min(24,S.transpose+1);
      else if (e.key==="["||e.key==="-") S.transpose=Math.max(-24,S.transpose-1);
      else if (e.key==="0") S.transpose=0;
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  // render + audio loop — starts immediately (audio context is already unlocked by the holo's ENTER gesture)
  useEffect(() => {
    Tone.start().catch(()=>{});
    buildAudio();
    const cvs = canvasRef.current!, ctx = cvs.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio||1);
    const resize = () => { cvs.width=innerWidth*dpr; cvs.height=innerHeight*dpr; cvs.style.width=innerWidth+"px"; cvs.style.height=innerHeight+"px"; ctx.setTransform(dpr,0,0,dpr,0,0); };
    resize(); addEventListener("resize", resize);
    let _cam: HTMLVideoElement | null = null;
    const mapPt = (lm:any): [number,number] => {
      if (!_cam) _cam = document.getElementById("holo-cam") as HTMLVideoElement | null;
      const vw=_cam?.videoWidth||16, vh=_cam?.videoHeight||9, W=innerWidth, H=innerHeight;
      const s=Math.max(W/vw,H/vh), dw=vw*s, dh=vh*s;
      return [W-(lm.x*dw-(dw-W)/2), lm.y*dh-(dh-H)/2];
    };
    const segFromAngle = (a:number,n:number)=>{ let rel=(a-START)%TWO_PI; if(rel<0)rel+=TWO_PI; return Math.floor(rel/(TWO_PI/n))%n; };
    const pickSeg = (a:number,n:number,o:any,dt:number)=>{ const c=segFromAngle(a,n); if(c===o.cand)o.t+=dt; else {o.cand=c;o.t=0;} if(o.t>=0.1)o.seg=o.cand; return o.seg; };
    const pinchOf = (lm:any)=> d2(lm[4],lm[8])<0.06;
    const smoothHand = (lm:any,s:any):[number,number]=>{ const [x,y]=mapPt(lm[9]); if(!s.on){s.x=x;s.y=y;s.on=true;} else {s.x+=(x-s.x)*0.35;s.y+=(y-s.y)*0.35;} return [s.x,s.y]; };

    const drawSkeleton = (lm:any, col:string)=>{
      ctx.save(); ctx.strokeStyle=col; ctx.lineWidth=2.4; ctx.lineCap="round"; ctx.shadowColor=col; ctx.shadowBlur=14;
      for(const [a,b] of HC){ const [x1,y1]=mapPt(lm[a]),[x2,y2]=mapPt(lm[b]); ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); }
      for(let i=0;i<lm.length;i++){ const big=TIPS.includes(i); const [x,y]=mapPt(lm[i]);
        ctx.fillStyle=big?"#ffffff":col; ctx.shadowBlur=big?16:6; ctx.beginPath(); ctx.arc(x,y,big?4:2.5,0,TWO_PI); ctx.fill(); }
      ctx.restore();
    };
    const drawWheel = (cx:number,cy:number,R:number,items:string[],sel:number,col:string,active:boolean,present:boolean)=>{
      const n=items.length, seg=TWO_PI/n;
      ctx.save(); ctx.globalAlpha = present ? 1 : 0.4;
      if(active){ ctx.beginPath(); ctx.arc(cx,cy,R+11,0,TWO_PI); ctx.strokeStyle=col; ctx.lineWidth=4; ctx.shadowColor=col; ctx.shadowBlur=36; ctx.stroke(); ctx.shadowBlur=0; }
      for(let i=0;i<n;i++){
        const a0=START+i*seg, a1=a0+seg, on=i===sel;
        ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,R,a0,a1); ctx.closePath();
        ctx.fillStyle= on ? col : "rgba(10,20,32,.32)"; ctx.shadowColor=col; ctx.shadowBlur=on?30:0; ctx.fill(); ctx.shadowBlur=0;
        ctx.strokeStyle="rgba(150,225,255,.28)"; ctx.lineWidth=1; ctx.stroke();
        const am=a0+seg/2, lr=R*0.76, lx=cx+Math.cos(am)*lr, ly=cy+Math.sin(am)*lr;
        ctx.fillStyle=on?"#05121c":"#dbf2ff"; ctx.font=on?"800 22px Helvetica":"800 17px Helvetica";
        ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(items[i], lx, ly);
      }
      ctx.beginPath(); ctx.arc(cx,cy,R*0.30,0,TWO_PI); ctx.fillStyle="rgba(4,10,18,.88)"; ctx.strokeStyle=col; ctx.lineWidth=2.5;
      ctx.shadowColor=col; ctx.shadowBlur=active?30:16; ctx.fill(); ctx.stroke(); ctx.shadowBlur=0;
      ctx.fillStyle=active?col:"#9fd0e0"; ctx.font="800 11px Helvetica"; ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.fillText(active?"LOCKED":"AIM", cx, cy-14);
      ctx.fillStyle=col; ctx.font="800 26px Helvetica"; ctx.fillText(items[sel], cx, cy+9);
      ctx.restore();
    };

    let _last = performance.now();
    const loop = () => {
      raf.current = requestAnimationFrame(loop);
      const now=performance.now(), dt=(now-_last)/1000; _last=now;
      const W=innerWidth, H=innerHeight; ctx.clearRect(0,0,W,H);
      const S = st.current;

      // classify hands by mirrored screen-x
      const list = multiHand.list || [];
      let L:any=null, R:any=null;
      if(list.length===1){ const mx=1-list[0][0].x; if(mx<0.5) L=list[0]; else R=list[0]; }
      else if(list.length>=2){ const a=list.map((h:any)=>({h,mx:1-h[0].x})).sort((p:any,q:any)=>p.mx-q.mx); L=a[0].h; R=a[a.length-1].h; }

      const LW:[number,number]=[W*0.25, H*0.42], RW:[number,number]=[W*0.75, H*0.42], R2=Math.min(210, H*0.26);
      const lp = !!(L && pinchOf(L)), rp = !!(R && pinchOf(R));

      if(L){ const lh=smoothHand(L,S.shL); if(!lp) S.liveRoot=pickSeg(Math.atan2(lh[1]-LW[1], lh[0]-LW[0]),ROOTS.length,S.rootSel,dt); drawSkeleton(L,"#5fe6ff"); } else S.shL.on=false;
      drawWheel(LW[0],LW[1],R2,ROOTS,S.liveRoot,"#5fe6ff",lp,!!L);
      if(R){ const rh=smoothHand(R,S.shR); if(!rp) S.liveQual=pickSeg(Math.atan2(rh[1]-RW[1], rh[0]-RW[0]),QUAL.length,S.qualSel,dt); drawSkeleton(R,"#ff7be5"); } else S.shR.on=false;
      drawWheel(RW[0],RW[1],R2,QUAL.map(q=>q.name),S.liveQual,"#ff7be5",rp,!!R);

      // pinch = strike (rings out → jump to the next chord with another pinch)
      const nowPinch = lp || rp;
      if(nowPinch && !S.prevPinch) strum(S.liveRoot, S.liveQual);
      S.prevPinch = nowPinch;

      // readout
      const off = SCALE[S.liveRoot]==null || !QUAL[S.liveQual].iv;
      const name = off ? "—" : ROOTS[S.liveRoot] + QUAL[S.liveQual].sym;
      const loaded = !!g.current.synth?.loaded;
      ctx.textAlign="center"; ctx.textBaseline="alphabetic";
      ctx.fillStyle = nowPinch ? "#ff7be5" : "rgba(180,235,255,.85)"; ctx.shadowColor = nowPinch ? "#ff7be5" : "#5fe6ff"; ctx.shadowBlur=26;
      ctx.font="900 60px Helvetica"; ctx.fillText(name, W/2, 96); ctx.shadowBlur=0;
      ctx.fillStyle = loaded ? "#7fb6c8" : "#ffd36e"; ctx.font="12px Helvetica";
      ctx.fillText(loaded ? (nowPinch?"▶ STRUCK":"🤏 pinch to play") : "LOADING PIANO…", W/2, 120);
      ctx.fillStyle="#9fc6d8";
      ctx.fillText("TRANSPOSE "+(S.transpose>=0?"+":"")+S.transpose+" st  ·  ↑↓ octave · [ ] semitone · 0 reset", W/2, 140);
    };
    raf.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf.current);
      removeEventListener("resize", resize);
      try { g.current.synth?.releaseAll?.(); g.current.synth?.dispose?.(); g.current.reverb?.dispose?.(); } catch {}
    };
  }, []);

  return (
    <div className="env-full" style={{ background:"transparent", zIndex:40 }}>
      <canvas ref={canvasRef} style={{ position:"fixed", inset:0, zIndex:41, pointerEvents:"none" }} />
      {/* exit is ✊ hold a fist (Esc as keyboard backup) */}
    </div>
  );
}
