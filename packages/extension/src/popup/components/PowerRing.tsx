interface PowerRingProps {
  enabled: boolean;
  isProcessing: boolean;
  latencyMs: number;
  onToggle: () => void;
}

export function PowerRing({ enabled, isProcessing, latencyMs, onToggle }: PowerRingProps) {
  const isActive = enabled && isProcessing;

  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-xl border transition-all duration-300 mb-4 ${
        isActive
          ? "bg-bg-secondary border-accent-cyan/15 shadow-[0_0_20px_rgba(0,240,255,0.04)]"
          : "bg-bg-secondary border-border-subtle"
      }`}
    >
      <button
        onClick={onToggle}
        className={`w-[52px] h-[52px] rounded-full border-[2.5px] flex items-center justify-center shrink-0 transition-all duration-300 cursor-pointer ${
          enabled
            ? "border-accent-cyan shadow-[0_0_16px_rgba(0,240,255,0.25),inset_0_0_12px_rgba(0,240,255,0.08)]"
            : "border-border-active"
        }`}
      >
        <div
          className={`w-5 h-5 rounded-full border-2 border-t-transparent relative transition-colors ${
            enabled ? "border-accent-cyan" : "border-text-tertiary"
          }`}
        >
          <div
            className={`absolute -top-[5px] left-1/2 -translate-x-1/2 w-0.5 h-2 rounded-sm transition-colors ${
              enabled ? "bg-accent-cyan" : "bg-text-tertiary"
            }`}
          />
        </div>
      </button>
      <div className="flex-1">
        <div className="font-[family-name:var(--font-display)] font-semibold text-sm text-text-primary">
          Noise Suppression
        </div>
        <div className="font-[family-name:var(--font-mono)] text-[11px] flex items-center gap-1.5">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              isActive
                ? "bg-accent-green shadow-[0_0_6px_rgba(0,255,136,0.4)]"
                : "bg-text-tertiary"
            }`}
          />
          <span className={isActive ? "text-accent-green" : "text-text-tertiary"}>
            {enabled ? (isProcessing ? "Active" : "Enabled") : "Disabled"}
          </span>
        </div>
        {enabled && (
          <div className="font-[family-name:var(--font-mono)] text-[10px] text-text-tertiary mt-0.5">
            {latencyMs > 0 ? `${latencyMs}ms` : "—"} · 48kHz
          </div>
        )}
      </div>
    </div>
  );
}
