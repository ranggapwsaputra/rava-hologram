import { useEffect, useRef, useState } from "react";
import { SplineScene } from "../SplineScene";
import { useFistExit } from "../useExit";
import { appView } from "../appStore";
import { hand } from "../handState";
import { askRava } from "../ravaAi";
import type { ChatMessage } from "../ravaAi";
import { speak as ravaSpeak } from "../voiceBridge";
import { 
  Mic, MicOff, Send, Volume2, VolumeX, Key, RefreshCw, 
  Cpu, Activity, Shield, Sparkles, MessageSquare, Terminal, Database 
} from "lucide-react";

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export default function RobotApp() {
  useFistExit(() => {
    // Clean up voice synthesis on exit
    window.speechSynthesis?.cancel();
    recognitionRef.current?.stop();
    appView.set("home");
  });

  const wrap = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // States
  const [provider, setProvider] = useState<"gemini" | "openai">(() => 
    (localStorage.getItem("rava_api_provider") as "gemini" | "openai") || "gemini"
  );
  const [geminiKey, setGeminiKey] = useState<string>(() => localStorage.getItem("gemini_api_key") || "");
  const [openaiKey, setOpenaiKey] = useState<string>(() => localStorage.getItem("openai_api_key") || "");
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<"IDLE" | "LISTENING" | "THINKING" | "SPEAKING" | "ERROR">("IDLE");
  const [autoListen, setAutoListen] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [inputText, setInputText] = useState("");
  const [err, setErr] = useState<string | null>(null);

  // Keep a mutable ref of state values for event listener closures
  const stateRef = useRef({ history, geminiKey, openaiKey, provider, isMuted, autoListen, status });
  useEffect(() => {
    stateRef.current = { history, geminiKey, openaiKey, provider, isMuted, autoListen, status };
  }, [history, geminiKey, openaiKey, provider, isMuted, autoListen, status]);

  // Drive the Spline scene with the hand
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const cv = wrap.current?.querySelector("canvas");
      if (cv && hand.present) {
        const clientX = hand.x * innerWidth, clientY = hand.y * innerHeight;
        const o: any = { clientX, clientY, bubbles: true, cancelable: true, view: window };
        cv.dispatchEvent(new PointerEvent("pointermove", { ...o, pointerId: 1, pointerType: "mouse" }));
        cv.dispatchEvent(new MouseEvent("mousemove", o));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Initialize Speech Synthesis & Recognition
  useEffect(() => {
    if (!SpeechRecognition) {
      setErr("Browser tidak mendukung Speech Recognition.");
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "id-ID";

    rec.onstart = () => {
      setStatus("LISTENING");
    };

    rec.onresult = async (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (!transcript) return;

      // Append user message
      setHistory(prev => [...prev, { role: "user", text: transcript }]);
      setStatus("THINKING");

      try {
        const activeKey = stateRef.current.provider === "openai" ? stateRef.current.openaiKey : stateRef.current.geminiKey;
        const reply = await askRava(transcript, stateRef.current.history, activeKey, stateRef.current.provider);
        
        // Extract command if any
        let cleanedReply = reply;
        let navTarget: string | null = null;
        const cmdRegex = /\[COMMAND:OPEN_(\w+)\]/;
        const match = reply.match(cmdRegex);
        if (match) {
          const cmdType = match[1];
          if (cmdType === "MUSIC") navTarget = "music";
          else if (cmdType === "GESTUREFX") navTarget = "gesturefx";
          else if (cmdType === "CHORDLAB") navTarget = "chordlab";
          else if (cmdType === "MEME") navTarget = "meme";
          else if (cmdType === "HOME") navTarget = "home";
          
          cleanedReply = reply.replace(cmdRegex, "").trim();
        }

        setHistory(prev => [...prev, { role: "model", text: cleanedReply }]);
        speak(cleanedReply, navTarget);
      } catch (e) {
        setStatus("IDLE");
        setHistory(prev => [...prev, { role: "model", text: "Maaf Om, ada gangguan transmisi." }]);
      }
    };

    rec.onerror = (e: any) => {
      console.warn("Speech recognition error:", e.error);
      if (e.error === "not-allowed") {
        setErr("Izin mikrofon dibatalkan.");
      }
      setStatus("IDLE");
    };

    rec.onend = () => {
      // If we finished listening but didn't transitions to thinking/speaking, go to idle
      setStatus(curr => (curr === "LISTENING" ? "IDLE" : curr));
    };

    recognitionRef.current = rec;

    // Greeting Jarvis on startup
    const timer = setTimeout(() => {
      const greeting = "Sistem online, Om Rangga. Saya RAVA, asisten virtual Anda. Ada yang bisa RAVA bantu?";
      setHistory([{ role: "model", text: greeting }]);
    }, 1500);

    return () => {
      clearTimeout(timer);
      window.speechSynthesis?.cancel();
      rec.stop();
    };
  }, []);

  // Auto scroll chat log
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  // Audio waveform visualizer animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId = 0;
    let phase = 0;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width;
      const h = canvas.height;
      const midY = h / 2;

      phase += 0.08;

      if (status === "IDLE") {
        // Flat breathing line
        ctx.beginPath();
        ctx.strokeStyle = "rgba(125, 223, 255, 0.4)";
        ctx.lineWidth = 1.5;
        for (let x = 0; x < w; x++) {
          const y = midY + Math.sin(x * 0.04 + phase) * 1.5;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (status === "LISTENING") {
        // High frequency active ripples
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(125, 223, 255, ${0.8 - i * 0.25})`;
          const amp = 10 + Math.sin(phase * 1.2) * 5;
          const freq = 0.05 + i * 0.015;
          for (let x = 0; x < w; x++) {
            const edgeFade = Math.sin((x / w) * Math.PI);
            const y = midY + Math.sin(x * freq + phase * (i + 1)) * amp * edgeFade;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      } else if (status === "THINKING") {
        // Scanning HUD line
        ctx.strokeStyle = "rgba(182, 157, 255, 0.7)";
        ctx.lineWidth = 2;
        const scanX = (Math.sin(phase * 0.4) * 0.5 + 0.5) * w;
        ctx.beginPath();
        ctx.moveTo(scanX, 0);
        ctx.lineTo(scanX, h);
        ctx.stroke();

        // Pulsing loading ring
        ctx.beginPath();
        ctx.arc(w / 2, midY, 14, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(182, 157, 255, 0.2)";
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(w / 2, midY, 14, phase, phase + Math.PI * 0.6);
        ctx.strokeStyle = "rgba(182, 157, 255, 0.9)";
        ctx.stroke();
      } else if (status === "SPEAKING") {
        // Multi-layered voice print wave
        const colors = ["rgba(125, 223, 255, 0.8)", "rgba(255, 207, 90, 0.7)", "rgba(255, 255, 255, 0.5)"];
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.strokeStyle = colors[i];
          ctx.lineWidth = i === 2 ? 1 : 2;

          const volumeMod = 0.4 + Math.sin(phase * 0.9) * 0.3 + Math.sin(phase * 2.1) * 0.3;
          const amp = (24 - i * 6) * Math.max(0.1, volumeMod);
          const freq = 0.035 - i * 0.007;

          for (let x = 0; x < w; x++) {
            const edgeFade = Math.sin((x / w) * Math.PI);
            const y = midY + Math.sin(x * freq - phase * (i + 1.5)) * amp * edgeFade;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }

      rafId = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(rafId);
  }, [status]);

  const speak = (text: string, navTarget: string | null = null) => {
    if (stateRef.current.isMuted) {
      setStatus("IDLE");
      if (navTarget) {
        appView.set(navTarget as any);
      } else if (stateRef.current.autoListen) {
        startListening();
      }
      return;
    }

    setStatus("SPEAKING");
    ravaSpeak(text, () => {
      setStatus("IDLE");
      if (navTarget) {
        appView.set(navTarget as any);
      } else if (stateRef.current.autoListen) {
        setTimeout(startListening, 300);
      }
    });
  };

  const startListening = () => {
    if (!recognitionRef.current) return;
    window.speechSynthesis?.cancel();
    try {
      recognitionRef.current.start();
    } catch (e) {
      console.warn("Recognition start skipped:", e);
    }
  };

  const toggleListening = () => {
    if (status === "LISTENING") {
      recognitionRef.current?.stop();
      setStatus("IDLE");
    } else {
      startListening();
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const text = inputText;
    setInputText("");

    // Stop speaking/listening to handle input
    window.speechSynthesis?.cancel();
    recognitionRef.current?.stop();

    setHistory(prev => [...prev, { role: "user", text }]);
    setStatus("THINKING");

    try {
      const activeKey = stateRef.current.provider === "openai" ? stateRef.current.openaiKey : stateRef.current.geminiKey;
      const reply = await askRava(text, stateRef.current.history, activeKey, stateRef.current.provider);
      
      // Extract command if any
      let cleanedReply = reply;
      let navTarget: string | null = null;
      const cmdRegex = /\[COMMAND:OPEN_(\w+)\]/;
      const match = reply.match(cmdRegex);
      if (match) {
        const cmdType = match[1];
        if (cmdType === "MUSIC") navTarget = "music";
        else if (cmdType === "GESTUREFX") navTarget = "gesturefx";
        else if (cmdType === "CHORDLAB") navTarget = "chordlab";
        else if (cmdType === "MEME") navTarget = "meme";
        else if (cmdType === "HOME") navTarget = "home";
        
        cleanedReply = reply.replace(cmdRegex, "").trim();
      }

      setHistory(prev => [...prev, { role: "model", text: cleanedReply }]);
      speak(cleanedReply, navTarget);
    } catch (e) {
      setStatus("IDLE");
      setHistory(prev => [...prev, { role: "model", text: "Maaf Om, terjadi masalah kognitif." }]);
    }
  };

  const clearMemory = () => {
    window.speechSynthesis?.cancel();
    recognitionRef.current?.stop();
    setHistory([]);
    setStatus("IDLE");
  };

  const saveApiKey = (key: string) => {
    if (provider === "openai") {
      setOpenaiKey(key);
      localStorage.setItem("openai_api_key", key);
    } else {
      setGeminiKey(key);
      localStorage.setItem("gemini_api_key", key);
    }
    setShowApiKeyInput(false);
  };

  const handleProviderChange = (p: "gemini" | "openai") => {
    setProvider(p);
    localStorage.setItem("rava_api_provider", p);
  };

  const selectQuickCommand = (cmd: string) => {
    setInputText(cmd);
    setTimeout(() => {
      const btn = document.getElementById("send-btn");
      btn?.click();
    }, 100);
  };

  const activeKey = provider === "openai" ? openaiKey : geminiKey;

  return (
    <div className="env-full black" ref={wrap}>
      {/* Spline 3D Orb Scene */}
      <SplineScene scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode" className="w-full h-full" />
      
      <div className="env-cap">RAVA TERMINAL ACTIVE</div>
      <div className="env-exit">✊ hold a fist to exit</div>

      {/* LEFT PANEL: Chat Log & Controls */}
      <div 
        className="absolute left-6 top-[10vh] bottom-[10vh] w-[360px] z-20 pointer-events-auto flex flex-col p-4"
        style={{
          background: "linear-gradient(160deg, rgba(8,16,22,.76), rgba(4,8,12,.86))",
          border: "1px solid rgba(125,223,255,.3)",
          borderRadius: "18px",
          boxShadow: "0 24px 70px rgba(0,0,0,.65), 0 0 36px rgba(125,223,255,.16), inset 0 1px 0 rgba(255,255,255,.12)",
          backdropFilter: "blur(6px)",
          color: "#eaffff"
        }}
      >
        <div className="flex items-center gap-2 pb-3 border-b border-cyan-500/20 mb-3">
          <Terminal className="text-cyan-400 w-5 h-5" />
          <span className="text-[12px] font-bold tracking-[0.2em] uppercase">RAVA CONSOLE</span>
          <span className="ml-auto text-[10px] text-cyan-400 font-mono tracking-wider">SECURE_LINK</span>
        </div>

        {/* Chat Logs */}
        <div className="flex-1 overflow-y-auto mb-4 pr-1 space-y-3 scrollbar-thin">
          {history.length === 0 ? (
            <div className="text-center text-cyan-400/40 text-[11px] mt-12">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Menghubungkan asisten...
            </div>
          ) : (
            history.map((msg, i) => (
              <div 
                key={i} 
                className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
              >
                <span className="text-[9px] text-cyan-400/50 mb-1 font-mono uppercase">
                  {msg.role === "user" ? "USER" : "RAVA"}
                </span>
                <div 
                  className={`text-[12px] p-3 rounded-[12px] leading-relaxed max-w-[85%] ${
                    msg.role === "user" 
                      ? "bg-cyan-500/20 border border-cyan-500/30 text-white rounded-tr-none" 
                      : "bg-white/10 border border-white/10 text-cyan-100 rounded-tl-none"
                  }`}
                  style={{
                    boxShadow: msg.role === "user" ? "0 0 10px rgba(95,230,255,0.1)" : "none"
                  }}
                >
                  {msg.text}
                </div>
              </div>
            ))
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Audio Wave Visualizer */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-[10px] text-cyan-400/60 font-mono mb-1">
            <span>VOICE MATRIX: {status}</span>
            <Activity className={`w-3.5 h-3.5 ${status !== "IDLE" ? "animate-pulse text-cyan-400" : ""}`} />
          </div>
          <canvas 
            ref={canvasRef} 
            width={328} 
            height={70} 
            className="w-full h-[70px] rounded-lg bg-black/60 border border-cyan-500/20"
          />
        </div>

        {/* Controls */}
        <div className="flex gap-2 mb-3">
          <button 
            onClick={toggleListening}
            className={`flex-1 flex items-center justify-center gap-2 p-2.5 rounded-lg border text-[11px] font-bold tracking-wider uppercase transition-all duration-200 ${
              status === "LISTENING" 
                ? "bg-red-500/20 border-red-500/50 text-red-300 shadow-[0_0_12px_rgba(239,68,68,0.25)] animate-pulse"
                : "bg-cyan-500/10 border-cyan-500/30 hover:bg-cyan-500/20 text-cyan-300"
            }`}
          >
            {status === "LISTENING" ? (
              <>
                <MicOff size={14} /> Stop Mic
              </>
            ) : (
              <>
                <Mic size={14} /> Bicara
              </>
            )}
          </button>
          
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className="p-2.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 transition-colors"
            title={isMuted ? "Unmute Voice Output" : "Mute Voice Output"}
          >
            {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
        </div>

        {/* Text Input Form */}
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <input 
            type="text" 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={SpeechRecognition ? "Ketik perintah Om..." : "Ketik disini (Speech tak didukung)..."}
            className="flex-1 bg-black/40 border border-cyan-500/20 rounded-lg px-3 py-2 text-[12px] text-cyan-100 placeholder-cyan-500/40 focus:outline-none focus:border-cyan-500/50"
          />
          <button 
            type="submit" 
            id="send-btn"
            className="p-2 bg-cyan-500/20 border border-cyan-500/40 rounded-lg text-cyan-300 hover:bg-cyan-500/30 active:scale-95 transition-all"
          >
            <Send size={14} />
          </button>
        </form>

        {/* Speech Support Warning */}
        {err && (
          <div className="mt-3 text-[10px] text-red-400 bg-red-500/15 border border-red-500/30 rounded px-2.5 py-1.5 flex items-center gap-1.5">
            <span>⚠️</span> {err}
          </div>
        )}
      </div>

      {/* RIGHT PANEL: Settings & Diagnostics */}
      <div 
        className="absolute right-6 top-[10vh] bottom-[10vh] w-[310px] z-20 pointer-events-auto flex flex-col p-4"
        style={{
          background: "linear-gradient(160deg, rgba(8,16,22,.76), rgba(4,8,12,.86))",
          border: "1px solid rgba(125,223,255,.3)",
          borderRadius: "18px",
          boxShadow: "0 24px 70px rgba(0,0,0,.65), 0 0 36px rgba(125,223,255,.16), inset 0 1px 0 rgba(255,255,255,.12)",
          backdropFilter: "blur(6px)",
          color: "#eaffff"
        }}
      >
        <div className="flex items-center gap-2 pb-3 border-b border-cyan-500/20 mb-4">
          <Cpu className="text-cyan-400 w-5 h-5" />
          <span className="text-[12px] font-bold tracking-[0.2em] uppercase">SYSTEM ANALYTICS</span>
        </div>

        {/* AI Mode State Indicator */}
        <div className="bg-black/30 border border-cyan-500/10 rounded-xl p-3 mb-4 space-y-2">
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-cyan-400/60 font-mono">CONNECTION STATUS:</span>
            <span className={`font-bold flex items-center gap-1.5 ${activeKey ? "text-emerald-400" : "text-amber-400"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${activeKey ? "bg-emerald-400 animate-ping" : "bg-amber-400"}`} />
              {activeKey ? `${provider.toUpperCase()} SECURE` : "LOCAL SIMULATOR"}
            </span>
          </div>
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-cyan-400/60 font-mono">LATENCY RATIO:</span>
            <span className="text-cyan-200 font-mono">{status === "THINKING" ? "COMPUTING..." : activeKey ? "142ms" : "Offline"}</span>
          </div>
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-cyan-400/60 font-mono">ARC CORE STRENGTH:</span>
            <span className="text-cyan-300 font-mono font-bold animate-pulse">98.8%</span>
          </div>
        </div>

        {/* Provider Selector */}
        <div className="mb-3">
          <span className="text-[10px] text-cyan-400/50 font-mono tracking-wider block mb-1.5 uppercase flex items-center gap-1">
            <Database size={11} /> AI Brain Provider
          </span>
          <div className="grid grid-cols-2 gap-2 p-1 bg-black/40 border border-cyan-500/20 rounded-lg">
            <button
              onClick={() => handleProviderChange("gemini")}
              className={`py-1.5 text-[11px] font-bold rounded transition-all ${
                provider === "gemini" 
                  ? "bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 shadow-[0_0_8px_rgba(95,230,255,0.15)]"
                  : "text-cyan-400/50 hover:text-cyan-300"
              }`}
            >
              Google Gemini
            </button>
            <button
              onClick={() => handleProviderChange("openai")}
              className={`py-1.5 text-[11px] font-bold rounded transition-all ${
                provider === "openai" 
                  ? "bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 shadow-[0_0_8px_rgba(95,230,255,0.15)]"
                  : "text-cyan-400/50 hover:text-cyan-300"
              }`}
            >
              OpenAI (GPT)
            </button>
          </div>
        </div>

        {/* API Key Panel */}
        <div className="mb-4">
          <button 
            onClick={() => setShowApiKeyInput(!showApiKeyInput)}
            className="w-full flex items-center justify-between p-2.5 rounded-lg border border-cyan-500/20 bg-black/40 hover:bg-cyan-500/10 text-[11px] text-cyan-300 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Key size={13} /> {provider === "openai" ? "Config OpenAI Key" : "Config Gemini Key"}
            </span>
            <span className="text-[10px] text-cyan-500/60">{activeKey ? "● Installed" : "+ Add"}</span>
          </button>

          {showApiKeyInput && (
            <div className="mt-2.5 p-3 bg-black/60 border border-cyan-500/25 rounded-lg space-y-2">
              <p className="text-[10px] text-cyan-400/70 leading-relaxed">
                {provider === "openai" ? (
                  <>Dapatkan API Key OpenAI di <a href="https://platform.openai.com" target="_blank" rel="noreferrer" className="underline text-cyan-300 hover:text-white">OpenAI Dashboard</a>.</>
                ) : (
                  <>Dapatkan API Key gratis di <a href="https://aistudio.google.com" target="_blank" rel="noreferrer" className="underline text-cyan-300 hover:text-white">Google AI Studio</a>.</>
                )}
              </p>
              <input 
                type="password" 
                placeholder={`Masukkan API Key ${provider === "openai" ? "OpenAI" : "Gemini"}...`}
                defaultValue={activeKey}
                id="api-key-input"
                className="w-full bg-black/70 border border-cyan-500/30 rounded px-2.5 py-1.5 text-[11px] text-white focus:outline-none focus:border-cyan-400"
              />
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    const val = (document.getElementById("api-key-input") as HTMLInputElement)?.value || "";
                    saveApiKey(val);
                  }}
                  className="flex-1 py-1.5 bg-cyan-500/30 hover:bg-cyan-500/40 text-[10px] font-bold text-cyan-100 rounded border border-cyan-500/50"
                >
                  Simpan
                </button>
                <button 
                  onClick={() => setShowApiKeyInput(false)}
                  className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-[10px] text-cyan-300 rounded"
                >
                  Batal
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Quick Commands Options */}
        <div className="flex-1">
          <span className="text-[10px] text-cyan-400/50 font-mono tracking-wider block mb-2 uppercase">QUICK COMMAND DIRECTIVES</span>
          <div className="grid grid-cols-1 gap-2">
            {[
              { text: "Cek Status Diagnostik", cmd: "Bagaimana status diagnostik sistem saat ini?" },
              { text: "Siapa Penciptamu?", cmd: "Siapakah pencipta kamu dan apa fungsi utama kamu?" },
              { text: "Rekomendasi Aktivitas", cmd: "Apakah ada saran aktivitas menarik untuk saya lakukan?" },
            ].map((item, idx) => (
              <button 
                key={idx}
                onClick={() => selectQuickCommand(item.cmd)}
                className="w-full text-left p-2.5 rounded-lg bg-black/40 border border-cyan-500/10 hover:border-cyan-500/30 hover:bg-cyan-500/5 text-[11px] text-cyan-100/90 transition-all flex items-center justify-between group"
              >
                <span>{item.text}</span>
                <Sparkles size={11} className="text-cyan-400/40 group-hover:text-cyan-400 transition-colors" />
              </button>
            ))}
          </div>
        </div>

        {/* Settings Footer */}
        <div className="mt-4 pt-3 border-t border-cyan-500/20 space-y-3">
          <label className="flex items-center justify-between text-[11px] text-cyan-400/70 cursor-pointer">
            <span className="flex items-center gap-1.5">
              <Shield size={12} /> Auto Listen (Percakapan Berkelanjutan)
            </span>
            <input 
              type="checkbox" 
              checked={autoListen}
              onChange={(e) => setAutoListen(e.target.checked)}
              className="accent-cyan-400 cursor-pointer"
            />
          </label>

          <button 
            onClick={clearMemory}
            className="w-full flex items-center justify-center gap-1.5 p-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-[10px] font-bold text-red-300/80 transition-colors"
          >
            <RefreshCw size={11} /> Bersihkan Memori RAVA
          </button>
        </div>
      </div>
    </div>
  );
}
