interface SiteToggleProps {
  domain: string;
  disabled: boolean;
  onToggle: () => void;
}

export function SiteToggle({ domain, disabled, onToggle }: SiteToggleProps) {
  if (!domain) return null;

  return (
    <div className="flex items-center justify-between px-3.5 py-2.5 bg-bg-secondary rounded-lg border border-border-subtle mb-4">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded bg-bg-tertiary flex items-center justify-center text-[9px] text-text-tertiary">
          🌐
        </div>
        <span className="font-[family-name:var(--font-mono)] text-[11px] text-text-secondary">
          {domain}
        </span>
      </div>
      <button
        onClick={onToggle}
        className={`w-9 h-5 rounded-[10px] relative cursor-pointer transition-colors duration-200 ${
          !disabled ? "bg-accent-green/20" : "bg-border-default"
        }`}
      >
        <div
          className={`w-4 h-4 rounded-full absolute top-0.5 transition-all duration-200 ${
            !disabled
              ? "left-[18px] bg-accent-green shadow-[0_0_6px_rgba(0,255,136,0.4)]"
              : "left-0.5 bg-text-tertiary"
          }`}
        />
      </button>
    </div>
  );
}
