import { useCallback } from "react";

interface StrengthSliderProps {
  value: number;
  onChange: (value: number) => void;
}

export function StrengthSlider({ value, onChange }: StrengthSliderProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(Number(e.target.value));
    },
    [onChange],
  );

  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-2">
        <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[2px] text-text-tertiary">
          Strength
        </span>
        <span className="font-[family-name:var(--font-mono)] text-xs text-accent-cyan font-semibold">
          {value}%
        </span>
      </div>
      <div className="relative">
        <div className="w-full h-1.5 bg-bg-tertiary rounded-full">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent-cyan to-accent-violet transition-[width] duration-150"
            style={{ width: `${value}%` }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={handleChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>
    </div>
  );
}
