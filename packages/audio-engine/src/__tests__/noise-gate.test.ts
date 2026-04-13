import { describe, it, expect } from "vitest";
import { NoiseGate } from "../noise-gate";

describe("NoiseGate", () => {
  it("passes through signal above threshold", () => {
    const gate = new NoiseGate();
    const loud = new Float32Array(480).fill(0.5);
    gate.process(loud, { thresholdDb: -40, attackMs: 1, releaseMs: 50 });
    const avgAbs = loud.reduce((s, v) => s + Math.abs(v), 0) / loud.length;
    expect(avgAbs).toBeGreaterThan(0.4);
  });

  it("attenuates signal below threshold", () => {
    const gate = new NoiseGate();
    const quiet = new Float32Array(480).fill(0.001);
    gate.process(quiet, { thresholdDb: -30, attackMs: 1, releaseMs: 50 });
    const avgAbs = quiet.reduce((s, v) => s + Math.abs(v), 0) / quiet.length;
    expect(avgAbs).toBeLessThan(0.001);
  });

  it("applies smooth envelope (no clicks)", () => {
    const gate = new NoiseGate();
    const loud = new Float32Array(480).fill(0.5);
    const quiet = new Float32Array(480).fill(0.001);
    const params = { thresholdDb: -30, attackMs: 5, releaseMs: 100 };
    gate.process(loud, params);
    gate.process(quiet, params);
    let hasPartialGain = false;
    for (let i = 0; i < quiet.length; i++) {
      if (Math.abs(quiet[i]) > 0.0001 && Math.abs(quiet[i]) < 0.001) {
        hasPartialGain = true;
        break;
      }
    }
    expect(hasPartialGain).toBe(true);
  });
});
