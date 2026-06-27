// JARVIS screen chrome — crisp vector overlay framing the whole experience.
export default function HudChrome() {
  return (
    <div className="hud">
      <span className="br tl" /><span className="br tr" /><span className="br bl" /><span className="br br2" />
      <div className="hud-read tl-r">BLANK SPACE OS · v1.0</div>
      <div className="hud-read tr-r">◉ HAND-TRACK</div>
      <div className="hud-read bl-r">SYS ◍ ONLINE</div>
      <div className="hud-read br-r">RAVA MODE</div>
      <div className="hud-scan" />
    </div>
  );
}
