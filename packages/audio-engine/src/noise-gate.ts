import { SAMPLE_RATE } from "./types";

export interface NoiseGateParams {
  thresholdDb: number;
  attackMs: number;
  releaseMs: number;
}

const KNEE_DB = 10;

export class NoiseGate {
  private gain: number = 0;

  process(samples: Float32Array, params: NoiseGateParams): void {
    const attackCoeff = 1 - Math.exp(-1 / (SAMPLE_RATE * params.attackMs / 1000));
    const releaseCoeff = 1 - Math.exp(-1 / (SAMPLE_RATE * params.releaseMs / 1000));

    for (let i = 0; i < samples.length; i++) {
      const absVal = Math.abs(samples[i]);
      const signalDb = absVal > 0 ? 20 * Math.log10(absVal) : -120;
      const threshDb = params.thresholdDb;

      // Soft-knee: compute instantaneous target gain from signal level
      let targetGain: number;
      if (signalDb >= threshDb) {
        targetGain = 1.0;
      } else if (signalDb < threshDb - KNEE_DB) {
        // Below knee: gate attenuation proportional to distance below threshold
        targetGain = Math.pow(10, (signalDb - threshDb) / 20);
      } else {
        // Within knee: smooth quadratic transition
        const x = signalDb - threshDb + KNEE_DB;
        const gainDb = (x * x) / (2 * KNEE_DB) - KNEE_DB;
        targetGain = Math.pow(10, gainDb / 20);
      }
      targetGain = Math.min(targetGain, 1.0);

      // Smooth the gain with asymmetric attack / release time constants
      if (targetGain > this.gain) {
        this.gain += attackCoeff * (targetGain - this.gain);
      } else {
        this.gain += releaseCoeff * (targetGain - this.gain);
      }

      samples[i] *= this.gain;
    }
  }
}
