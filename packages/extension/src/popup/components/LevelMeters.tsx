import type { AudioMetrics } from "@hush/audio-engine";

interface LevelMetersProps {
  metrics: AudioMetrics;
}

function dbToPercent(db: number): number {
  return Math.max(0, Math.min(100, ((db + 96) / 96) * 100));
}

function MeterRow({ label, value, colorClass }: { label: string; value: number; colorClass: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-2 last:mb-0">
      <span className="font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-[1.5px] text-text-tertiary w-[52px] shrink-0">
        {label}
      </span>
      <div className="flex-1 h-1 bg-bg-tertiary rounded-sm overflow-hidden">
        <div
          className={`h-full rounded-sm transition-[width] duration-100 ${colorClass}`}
          style={{ width: `${dbToPercent(value)}%` }}
        />
      </div>
      <span className="font-[family-name:var(--font-mono)] text-[10px] text-text-tertiary w-[46px] text-right tabular-nums shrink-0">
        {value > -96 ? `${value.toFixed(1)} dB` : "—"}
      </span>
    </div>
  );
}

export function LevelMeters({ metrics }: LevelMetersProps) {
  return (
    <div className="p-3.5 bg-bg-secondary rounded-[10px] border border-border-subtle mb-4">
      <MeterRow label="Input" value={metrics.inputLevel} colorClass="bg-gradient-to-r from-accent-cyan to-accent-violet" />
      <MeterRow label="Output" value={metrics.outputLevel} colorClass="bg-gradient-to-r from-accent-green to-accent-cyan" />
      <MeterRow label="Removed" value={metrics.reduction} colorClass="bg-gradient-to-r from-accent-amber to-accent-magenta" />
    </div>
  );
}
