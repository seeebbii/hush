import { Rnnoise, type DenoiseState } from "@shiguredo/rnnoise-wasm";

const FRAME_SIZE = 480;
const SCALE_UP = 32768;
const SCALE_DOWN = 1 / 32768;

class NoiseProcessor extends AudioWorkletProcessor {
  private rnnoise: Rnnoise | null = null;
  private denoiseState: DenoiseState | null = null;

  // Pre-allocated buffers (never allocate in process())
  private inputBuffer: Float32Array = new Float32Array(FRAME_SIZE + 128);
  private rnnoiseFrame: Float32Array = new Float32Array(FRAME_SIZE);
  private outputBuffer: Float32Array = new Float32Array(FRAME_SIZE);
  private bufferWritePos: number = 0;
  private outputReadPos: number = 0;
  private outputAvailable: number = 0;

  // Parameters
  private enabled: boolean = true;
  private strength: number = 75; // 0-100 wet/dry mix

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

    // Read from processed output buffer if available
    if (this.outputAvailable > 0) {
      const toRead = Math.min(input.length, this.outputAvailable);
      output.set(this.outputBuffer.subarray(this.outputReadPos, this.outputReadPos + toRead));
      this.outputReadPos += toRead;
      this.outputAvailable -= toRead;
      if (toRead < input.length) output.fill(0, toRead);
    } else {
      output.fill(0);
    }

    // Accumulate input
    this.inputBuffer.set(input, this.bufferWritePos);
    this.bufferWritePos += input.length;

    // Process when we have a full frame
    if (this.bufferWritePos >= FRAME_SIZE) {
      // Measure input
      let inputRms = 0;
      for (let i = 0; i < FRAME_SIZE; i++) {
        inputRms += this.inputBuffer[i] * this.inputBuffer[i];
      }
      inputRms = Math.sqrt(inputRms / FRAME_SIZE);

      // Scale to int16 range for RNNoise
      for (let i = 0; i < FRAME_SIZE; i++) {
        this.rnnoiseFrame[i] = this.inputBuffer[i] * SCALE_UP;
      }

      const vadProb = this.denoiseState.processFrame(this.rnnoiseFrame);

      // Apply wet/dry mix
      const wet = this.strength / 100;
      const dry = 1 - wet;
      for (let i = 0; i < FRAME_SIZE; i++) {
        this.outputBuffer[i] =
          this.rnnoiseFrame[i] * SCALE_DOWN * wet +
          this.inputBuffer[i] * dry;
      }

      // Measure output
      let outputRms = 0;
      for (let i = 0; i < FRAME_SIZE; i++) {
        outputRms += this.outputBuffer[i] * this.outputBuffer[i];
      }
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

      // Move leftover
      const leftover = this.bufferWritePos - FRAME_SIZE;
      if (leftover > 0) {
        this.inputBuffer.copyWithin(0, FRAME_SIZE, this.bufferWritePos);
      }
      this.bufferWritePos = leftover;
      this.outputReadPos = 0;
      this.outputAvailable = FRAME_SIZE;
    }

    return true;
  }
}

registerProcessor("noise-processor", NoiseProcessor);
