// Polyfills for URL, document, WorkerGlobalScope are injected at bundle time
// by the workletPolyfillPlugin in vite.config.ts
import { Rnnoise, type DenoiseState } from "@shiguredo/rnnoise-wasm";

const FRAME_SIZE = 480;
const SCALE_UP = 32768;
const SCALE_DOWN = 1 / 32768;
const RING_SIZE = 4096;
const RING_MASK = RING_SIZE - 1;
const METRICS_INTERVAL = 8;

class NoiseProcessor extends AudioWorkletProcessor {
  private rnnoise: Rnnoise | null = null;
  private denoiseState: DenoiseState | null = null;

  // Ring buffers
  private inRing = new Float32Array(RING_SIZE);
  private outRing = new Float32Array(RING_SIZE);
  private inWrite = 0;
  private inRead = 0;
  private outWrite = 0;
  private outRead = 0;

  // Scratch buffers
  private rnnoiseFrame = new Float32Array(FRAME_SIZE);
  private rawFrame = new Float32Array(FRAME_SIZE);

  // Parameters
  private enabled = true;
  private strength = 75;
  private frameCount = 0;
  private primed = false;

  // VAD gate state
  private gateGain = 1.0;
  private vadSmoothed = 0;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent) => this.handleMessage(e.data);
    this.initRnnoise();
  }

  private async initRnnoise(): Promise<void> {
    try {
      this.rnnoise = await Rnnoise.load();
      this.denoiseState = this.rnnoise.createDenoiseState();
      this.port.postMessage({ type: "ready" });
    } catch (err) {
      this.port.postMessage({ type: "error", error: String(err) });
    }
  }

  private handleMessage(msg: { type: string; [key: string]: unknown }): void {
    if (msg.type === "params") {
      if (typeof msg.enabled === "boolean") this.enabled = msg.enabled;
      if (typeof msg.strength === "number") this.strength = msg.strength;
    }
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!input || !output) return true;

    if (!this.enabled || !this.denoiseState) {
      output.set(input);
      return true;
    }

    // Write input to ring
    for (let i = 0; i < input.length; i++) {
      this.inRing[(this.inWrite + i) & RING_MASK] = input[i];
    }
    this.inWrite += input.length;

    // Process complete frames
    while (this.inWrite - this.inRead >= FRAME_SIZE) {
      for (let i = 0; i < FRAME_SIZE; i++) {
        const sample = this.inRing[(this.inRead + i) & RING_MASK];
        this.rawFrame[i] = sample;
        this.rnnoiseFrame[i] = sample * SCALE_UP;
      }
      this.inRead += FRAME_SIZE;

      // RNNoise ML denoising
      const vadProb = this.denoiseState.processFrame(this.rnnoiseFrame);

      // Smooth VAD (fast attack, slow release to avoid cutting word tails)
      if (vadProb > this.vadSmoothed) {
        this.vadSmoothed = this.vadSmoothed * 0.3 + vadProb * 0.7; // fast attack
      } else {
        this.vadSmoothed = this.vadSmoothed * 0.92 + vadProb * 0.08; // slow release
      }

      // Strength controls suppression aggressiveness:
      // 0-30%: RNNoise only (no gate)
      // 30-70%: RNNoise + light VAD gate
      // 70-100%: RNNoise + aggressive VAD gate (kills all non-speech)
      const aggressiveness = this.strength / 100;

      // Always use full RNNoise denoised output (no dry mix)
      // VAD gate provides additional suppression on top

      // VAD gate: smoothly attenuate when no speech detected
      let targetGain: number;
      if (aggressiveness < 0.3) {
        // Light mode: no gating, just RNNoise
        targetGain = 1.0;
      } else {
        // Gate mode: use VAD to suppress non-speech
        const vadThreshold = 0.2 + (aggressiveness - 0.3) * 0.57; // 0.2 to 0.6
        if (this.vadSmoothed > vadThreshold) {
          targetGain = 1.0; // speech detected — fully open
        } else {
          // Proportional suppression: more below threshold = more suppression
          const ratio = this.vadSmoothed / vadThreshold;
          const suppressionDepth = 0.3 + aggressiveness * 0.7; // 0.3 to 1.0
          targetGain = ratio * (1 - suppressionDepth) + (1 - suppressionDepth);
          targetGain = Math.max(targetGain, 0);
        }
      }

      // Smooth gate transitions
      if (targetGain > this.gateGain) {
        this.gateGain += 0.4 * (targetGain - this.gateGain); // fast open
      } else {
        this.gateGain += 0.08 * (targetGain - this.gateGain); // slow close
      }
      if (this.gateGain < 0.002) this.gateGain = 0;

      // Write output: RNNoise denoised * gate gain
      for (let i = 0; i < FRAME_SIZE; i++) {
        this.outRing[(this.outWrite + i) & RING_MASK] =
          this.rnnoiseFrame[i] * SCALE_DOWN * this.gateGain;
      }
      this.outWrite += FRAME_SIZE;
      this.primed = true;

      // Throttled metrics
      this.frameCount++;
      if (this.frameCount % METRICS_INTERVAL === 0) {
        let inputRms = 0;
        let outputRms = 0;
        for (let i = 0; i < FRAME_SIZE; i++) {
          inputRms += this.rawFrame[i] * this.rawFrame[i];
          const out = this.outRing[(this.outWrite - FRAME_SIZE + i) & RING_MASK];
          outputRms += out * out;
        }
        inputRms = Math.sqrt(inputRms / FRAME_SIZE);
        outputRms = Math.sqrt(outputRms / FRAME_SIZE);
        const inputDb = inputRms > 0 ? 20 * Math.log10(inputRms) : -96;
        const outputDb = outputRms > 0 ? 20 * Math.log10(outputRms) : -96;

        const bufferDelayMs = Math.round(
          ((this.inWrite - this.inRead) / 48000) * 1000 +
            (FRAME_SIZE / 48000) * 1000,
        );
        this.port.postMessage({
          type: "metrics",
          inputLevel: inputDb,
          outputLevel: outputDb,
          reduction: Math.max(0, inputDb - outputDb),
          vadProbability: this.vadSmoothed,
          latencyMs: bufferDelayMs,
        });
      }
    }

    // Read from output ring
    const outAvailable = this.outWrite - this.outRead;
    if (outAvailable >= input.length) {
      for (let i = 0; i < input.length; i++) {
        output[i] = this.outRing[(this.outRead + i) & RING_MASK];
      }
      this.outRead += input.length;
    } else {
      output.set(input); // pass through until primed
    }

    return true;
  }
}

registerProcessor("noise-processor", NoiseProcessor);
