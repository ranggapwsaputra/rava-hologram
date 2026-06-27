export default function AppFrame({ title, accent, leaving, children, className = "" }: {
  title: string; accent: string; leaving: boolean; children: any; className?: string;
}) {
  return (
    <div className={"appframe " + (leaving ? "leaving " : "") + className} style={{ ["--c" as any]: accent }}>
      <div className="af-head">
        <span className="af-dot" />
        <span className="af-title">{title}</span>
        <span className="af-exit">✊ hold fist to exit</span>
      </div>
      <div className="af-body">{children}</div>
    </div>
  );
}
