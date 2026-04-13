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
    metrics,
    currentDomain,
    isProcessing,
    isSiteDisabled,
    setEnabled,
    setStrength,
    toggleSite,
  } = useHushState();

  return (
    <div className="p-5">
      <Header />
      <PowerRing
        enabled={enabled}
        isProcessing={isProcessing}
        onToggle={() => setEnabled(!enabled)}
      />
      <StrengthSlider value={strength} onChange={setStrength} />
      <LevelMeters metrics={metrics} />
      <SiteToggle
        domain={currentDomain}
        disabled={isSiteDisabled}
        onToggle={toggleSite}
      />
      <div className="flex items-center justify-center gap-3 pt-2 border-t border-border-subtle">
        <span className="font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-[1.5px] text-text-tertiary">
          v0.1.0
        </span>
      </div>
    </div>
  );
}
