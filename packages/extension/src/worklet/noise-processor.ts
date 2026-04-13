// Polyfills for URL, document, WorkerGlobalScope are injected at bundle time
// by the workletPolyfillPlugin in vite.config.ts — they must run before
// the Emscripten-compiled RNNoise WASM loader evaluates.
import { Rnnoise, type DenoiseState } from "@shiguredo/rnnoise-wasm";

const FRAME_SIZE = 480;
const SCALE_UP = 32768;
const SCALE_DOWN = 1 / 32768;
const RING_SIZE = 4096; // Power of 2, fits multiple frames
const RING_MASK = RING_SIZE - 1;
const METRICS_INTERVAL = 8; // Send metrics every ~80ms

class NoiseProcessor extends AudioWorkletProcessor {
  private rnnoise: Rnnoise | null = null;
  private denoiseState: DenoiseState | null = null;

  // Ring buffers — no allocations during processing
  private inRing = new Float32Array(RING_SIZE);
  private outRing = new Float32Array(RING_SIZE);
  private inWrite = 0;
  private inRead = 0;
  private outWrite = 0;
  private outRead = 0;

  // Scratch buffers for RNNoise (pre-allocated)
  private rnnoiseFrame = new Float32Array(FRAME_SIZE);
  private rawFrame = new Float32Array(FRAME_SIZE);

  // Parameters
  private enabled = true;
  private strength = 75;
  private frameCount = 0;
  private primed = false; // true once first frame has been processed

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

    // Pass through if disabled or WASM not ready
    if (!this.enabled || !this.denoiseState) {
      output.set(input);
      return true;
    }

    // Write input samples to input ring buffer
    for (let i = 0; i < input.length; i++) {
      this.inRing[(this.inWrite + i) & RING_MASK] = input[i];
    }
    this.inWrite += input.length;

    // Process all complete frames available in input ring
    while (this.inWrite - this.inRead >= FRAME_SIZE) {
      // Copy frame from input ring and save raw copy for wet/dry mix
      for (let i = 0; i < FRAME_SIZE; i++) {
        const sample = this.inRing[(this.inRead + i) & RING_MASK];
        this.rawFrame[i] = sample;
        this.rnnoiseFrame[i] = sample * SCALE_UP;
      }
      this.inRead += FRAME_SIZE;

      // RNNoise processes in-place
      const vadProb = this.denoiseState.processFrame(this.rnnoiseFrame);

      // Write processed output to output ring with wet/dry mix
      const wet = this.strength / 100;
      const dry = 1 - wet;
      for (let i = 0; i < FRAME_SIZE; i++) {
        this.outRing[(this.outWrite + i) & RING_MASK] =
          this.rnnoiseFrame[i] * SCALE_DOWN * wet +
          this.rawFrame[i] * dry;
      }
      this.outWrite += FRAME_SIZE;
      this.primed = true;

      // Send metrics at throttled rate
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

        this.port.postMessage({
          type: "metrics",
          inputLevel: inputDb,
          outputLevel: outputDb,
          reduction: inputDb - outputDb,
          vadProbability: vadProb,
        });
      }
    }

    // Read from output ring buffer
    const outAvailable = this.outWrite - this.outRead;
    if (outAvailable >= input.length) {
      for (let i = 0; i < input.length; i++) {
        output[i] = this.outRing[(this.outRead + i) & RING_MASK];
      }
      this.outRead += input.length;
    } else if (!this.primed) {
      // Not primed yet — pass through raw audio until first frame processed
      output.set(input);
    } else {
      // Underrun (shouldn't happen in normal operation) — pass through
      output.set(input);
    }

    return true;
  }
}

registerProcessor("noise-processor", NoiseProcessor);
