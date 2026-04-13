// Polyfills for URL, document, WorkerGlobalScope are injected at bundle time
// by the workletPolyfillPlugin in vite.config.ts — they must run before
// the Emscripten-compiled RNNoise WASM loader evaluates.
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

  // VAD-driven noise gate state
  private gateGain = 0; // current gate gain (0 = closed, 1 = open)
  private vadSmoothed = 0; // smoothed VAD probability

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

    // Write input to input ring
    for (let i = 0; i < input.length; i++) {
      this.inRing[(this.inWrite + i) & RING_MASK] = input[i];
    }
    this.inWrite += input.length;

    // Process all complete frames
    while (this.inWrite - this.inRead >= FRAME_SIZE) {
      for (let i = 0; i < FRAME_SIZE; i++) {
        const sample = this.inRing[(this.inRead + i) & RING_MASK];
        this.rawFrame[i] = sample;
        this.rnnoiseFrame[i] = sample * SCALE_UP;
      }
      this.inRead += FRAME_SIZE;

      // RNNoise: ML denoising + VAD
      const vadProb = this.denoiseState.processFrame(this.rnnoiseFrame);

      // Smooth VAD to avoid flutter (exponential moving average)
      this.vadSmoothed = this.vadSmoothed * 0.7 + vadProb * 0.3;

      // Compute input energy (RMS in dBFS)
      let inputRms = 0;
      for (let i = 0; i < FRAME_SIZE; i++) {
        inputRms += this.rawFrame[i] * this.rawFrame[i];
      }
      inputRms = Math.sqrt(inputRms / FRAME_SIZE);
      const inputDb = inputRms > 0 ? 20 * Math.log10(inputRms) : -96;

      // --- VAD-driven noise gate ---
      // Strength 0-100 maps to gate aggressiveness:
      //   0 = no gating (passthrough)
      //   50 = moderate (gate when VAD < 0.3 and signal quiet)
      //   100 = aggressive (gate when VAD < 0.6 or signal quiet)
      const aggressiveness = this.strength / 100;

      // VAD threshold: higher strength = higher threshold = more gating
      const vadThreshold = 0.15 + aggressiveness * 0.45; // 0.15 to 0.6

      // Energy threshold: gate signals quieter than this (far voices are quieter)
      // Higher strength = higher threshold = only close/loud voice passes
      const energyThresholdDb = -50 + aggressiveness * 20; // -50 to -30 dBFS

      // Gate decision: open if speech detected AND signal is loud enough
      const isSpeech = this.vadSmoothed > vadThreshold;
      const isLoud = inputDb > energyThresholdDb;
      const shouldOpen = isSpeech && isLoud;

      // Smooth gate gain (attack fast, release slower to avoid chopping words)
      const attackRate = 0.3; // open quickly
      const releaseRate = 0.05 + (1 - aggressiveness) * 0.1; // close speed depends on strength
      const targetGain = shouldOpen ? 1.0 : 0.0;

      if (targetGain > this.gateGain) {
        this.gateGain += attackRate * (targetGain - this.gateGain);
      } else {
        this.gateGain += releaseRate * (targetGain - this.gateGain);
      }

      // Clamp small values to zero to ensure silence when gate is closed
      if (this.gateGain < 0.001) this.gateGain = 0;

      // Write processed + gated output to output ring
      // Full RNNoise (no dry mix) when strength > 50, blend below 50
      const wet = Math.min(aggressiveness * 2, 1.0); // 0-50% strength = blend, 50-100% = full RNNoise
      const dry = 1 - wet;

      for (let i = 0; i < FRAME_SIZE; i++) {
        const denoised = this.rnnoiseFrame[i] * SCALE_DOWN * wet + this.rawFrame[i] * dry;
        this.outRing[(this.outWrite + i) & RING_MASK] = denoised * this.gateGain;
      }
      this.outWrite += FRAME_SIZE;
      this.primed = true;

      // Send metrics
      this.frameCount++;
      if (this.frameCount % METRICS_INTERVAL === 0) {
        let outputRms = 0;
        for (let i = 0; i < FRAME_SIZE; i++) {
          const out = this.outRing[(this.outWrite - FRAME_SIZE + i) & RING_MASK];
          outputRms += out * out;
        }
        outputRms = Math.sqrt(outputRms / FRAME_SIZE);
        const outputDb = outputRms > 0 ? 20 * Math.log10(outputRms) : -96;

        this.port.postMessage({
          type: "metrics",
          inputLevel: inputDb,
          outputLevel: outputDb,
          reduction: Math.max(0, inputDb - outputDb),
          vadProbability: this.vadSmoothed,
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
    } else if (!this.primed) {
      output.set(input);
    } else {
      output.set(input);
    }

    return true;
  }
}

registerProcessor("noise-processor", NoiseProcessor);
