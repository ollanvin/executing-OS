/**
 * Hex brand mark — swap inner content for rocket SVG / favicon later.
 */
export function HexLogo() {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-indigo-500/30 to-slate-800/80"
        aria-hidden
      >
        <span className="text-xs font-semibold tracking-tight text-hex-text">H</span>
      </div>
      <span className="text-[13px] font-medium tracking-tight text-hex-text">
        Hex Executor Console
      </span>
    </div>
  );
}
