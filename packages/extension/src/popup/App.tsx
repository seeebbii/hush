import { Header } from "./components/Header";
import { PowerRing } from "./components/PowerRing";
import { StrengthSlider } from "./components/StrengthSlider";
import { LevelMeters } from "./components/LevelMeters";
import { SiteToggle } from "./components/SiteToggle";
import { useHushState } from "./hooks/useHushState";

export function App() {
  const {
    enabled,
    strength,
    monitor,
    metrics,
    currentDomain,
    isProcessing,
    isSiteDisabled,
    setEnabled,
    setStrength,
    toggleSite,
    toggleMonitor,
  } = useHushState();

  return (
    <div className="p-5">
      <Header />
      <PowerRing
        enabled={enabled}
        isProcessing={isProcessing}
        latencyMs={metrics.latencyMs}
        onToggle={() => setEnabled(!enabled)}
      />
      <StrengthSlider value={strength} onChange={setStrength} />
      <LevelMeters metrics={metrics} />
      <SiteToggle
        domain={currentDomain}
        disabled={isSiteDisabled}
        onToggle={toggleSite}
      />
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-bg-secondary rounded-lg border border-border-subtle mb-4">
        <div className="flex items-center gap-2">
          <span className="font-[family-name:var(--font-mono)] text-[11px] text-text-secondary">
            🎧
          </span>
          <span className="font-[family-name:var(--font-mono)] text-[11px] text-text-secondary">
            Monitor
          </span>
        </div>
        <button
          onClick={toggleMonitor}
          className={`w-9 h-5 rounded-[10px] relative cursor-pointer transition-colors duration-200 ${
            monitor ? "bg-accent-cyan/20" : "bg-border-default"
          }`}
        >
          <div
            className={`w-4 h-4 rounded-full absolute top-0.5 transition-all duration-200 ${
              monitor
                ? "left-[18px] bg-accent-cyan shadow-[0_0_6px_rgba(0,240,255,0.4)]"
                : "left-0.5 bg-text-tertiary"
            }`}
          />
        </button>
      </div>
      <div className="flex items-center justify-center gap-3 pt-2 border-t border-border-subtle">
        <span className="font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-[1.5px] text-text-tertiary">
          v0.1.0
        </span>
      </div>
    </div>
  );
}
