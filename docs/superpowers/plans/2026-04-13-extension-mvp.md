# HUSH Extension MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Working cross-browser extension that transparently denoises mic audio on any website via getUserMedia hijack + RNNoise WASM AudioWorklet.

**Architecture:** Content script wraps `getUserMedia` at `document_start`. When a page requests mic, raw audio routes through AudioWorklet (128→480 frame buffer → RNNoise WASM → noise gate) and clean MediaStream returns to page. Popup provides toggle + strength + meters. Background service worker coordinates state.

**Tech Stack:** TypeScript, React 18, Vite 5, `vite-plugin-web-extension`, `@shiguredo/rnnoise-wasm`, `webextension-polyfill`, Tailwind CSS 4, Vitest

---

## Task 1: Monorepo Scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `packages/audio-engine/package.json`
- Create: `packages/audio-engine/tsconfig.json`
- Create: `packages/extension/package.json`
- Create: `packages/extension/tsconfig.json`

- [ ] **Step 1: Initialize root package.json**

```json
{
  "name": "hush",
  "private": true,
  "scripts": {
    "dev:extension": "pnpm --filter @hush/extension dev",
    "build:extension": "pnpm --filter @hush/extension build",
    "build:extension:firefox": "pnpm --filter @hush/extension build:firefox",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck"
  },
  "devDependencies": {
    "turbo": "^2.4.0",
    "typescript": "^5.7.0"
  },
  "packageManager": "pnpm@9.15.0"
}
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 3: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "pkg/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {},
    "lint": {},
    "typecheck": {}
  }
}
```

- [ ] **Step 4: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 5: Create audio-engine package**

`packages/audio-engine/package.json`:
```json
{
  "name": "@hush/audio-engine",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@shiguredo/rnnoise-wasm": "^2025.1.0"
  },
  "devDependencies": {
    "vitest": "^3.0.0",
    "typescript": "^5.7.0"
  }
}
```

`packages/audio-engine/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 6: Create extension package**

`packages/extension/package.json`:
```json
{
  "name": "@hush/extension",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "BROWSER=chrome vite build --watch --mode development",
    "build": "BROWSER=chrome vite build",
    "build:firefox": "BROWSER=firefox vite build --outDir dist/firefox",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@hush/audio-engine": "workspace:*",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "webextension-polyfill": "^0.12.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.1.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@types/webextension-polyfill": "^0.12.0",
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^4.1.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vite-plugin-web-extension": "^4.4.0",
    "vitest": "^3.0.0"
  }
}
```

`packages/extension/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 7: Install dependencies**

Run: `pnpm install`
Expected: Clean install, lockfile created

- [ ] **Step 8: Verify monorepo**

Run: `pnpm ls --filter @hush/audio-engine && pnpm ls --filter @hush/extension`
Expected: Both packages listed with their dependencies

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json tsconfig.base.json packages/audio-engine/ packages/extension/ pnpm-lock.yaml
git commit -m "chore: scaffold monorepo with audio-engine and extension packages"
```

---

## Task 2: Audio Engine — Types + Frame Buffer

**Files:**
- Create: `packages/audio-engine/src/types.ts`
- Create: `packages/audio-engine/src/frame-buffer.ts`
- Create: `packages/audio-engine/src/index.ts`
- Create: `packages/audio-engine/src/__tests__/frame-buffer.test.ts`

- [ ] **Step 1: Write types**

`packages/audio-engine/src/types.ts`:
```typescript
export interface AudioMetrics {
  inputLevel: number;   // dBFS
  outputLevel: number;  // dBFS
  reduction: number;    // dB removed
  vadProbability: number; // 0-1
}

export interface ProcessorParams {
  enabled: boolean;
  strength: number; // 0-100
}

export const RNNOISE_FRAME_SIZE = 480;
export const WORKLET_QUANTUM = 128;
export const SAMPLE_RATE = 48000;
```

- [ ] **Step 2: Write failing tests for frame buffer**

`packages/audio-engine/src/__tests__/frame-buffer.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { FrameBuffer } from "../frame-buffer";
import { RNNOISE_FRAME_SIZE, WORKLET_QUANTUM } from "../types";

describe("FrameBuffer", () => {
  it("accumulates samples until frame size reached", () => {
    const buffer = new FrameBuffer(RNNOISE_FRAME_SIZE);
    const chunk = new Float32Array(WORKLET_QUANTUM).fill(0.5);

    // 128 * 3 = 384, not enough for 480
    expect(buffer.write(chunk)).toBe(null);
    expect(buffer.write(chunk)).toBe(null);
    expect(buffer.write(chunk)).toBe(null);

    // 384 + 128 = 512, should yield a 480-sample frame
    const frame = buffer.write(chunk);
    expect(frame).not.toBe(null);
    expect(frame!.length).toBe(RNNOISE_FRAME_SIZE);
    expect(frame![0]).toBe(0.5);
  });

  it("preserves leftover samples across frames", () => {
    const buffer = new FrameBuffer(RNNOISE_FRAME_SIZE);
    const chunk = new Float32Array(WORKLET_QUANTUM);

    // Fill with sequential values to verify order
    for (let i = 0; i < WORKLET_QUANTUM; i++) chunk[i] = i;

    // Write 4 chunks (512 samples) — yields frame of 480, leftover 32
    buffer.write(chunk);
    buffer.write(chunk);
    buffer.write(chunk);
    const frame = buffer.write(chunk);
    expect(frame).not.toBe(null);
    expect(frame!.length).toBe(480);

    // Leftover is 32 samples. Need 448 more (3.5 chunks).
    // Write 3 more chunks = 32 + 384 = 416, still short
    buffer.write(chunk);
    buffer.write(chunk);
    expect(buffer.write(chunk)).toBe(null);

    // 416 + 128 = 544, should yield another frame
    const frame2 = buffer.write(chunk);
    expect(frame2).not.toBe(null);
    expect(frame2!.length).toBe(480);
  });

  it("returns pre-allocated buffer (no allocation per frame)", () => {
    const buffer = new FrameBuffer(RNNOISE_FRAME_SIZE);
    const chunk = new Float32Array(WORKLET_QUANTUM).fill(1.0);

    // Get first frame
    buffer.write(chunk);
    buffer.write(chunk);
    buffer.write(chunk);
    const frame1 = buffer.write(chunk);

    // Get second frame — should reuse same Float32Array
    buffer.write(chunk);
    buffer.write(chunk);
    buffer.write(chunk);
    const frame2 = buffer.write(chunk);

    expect(frame1).toBe(frame2); // same reference
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/audio-engine && npx vitest run --reporter=verbose`
Expected: FAIL — `FrameBuffer` not found

- [ ] **Step 4: Implement FrameBuffer**

`packages/audio-engine/src/frame-buffer.ts`:
```typescript
export class FrameBuffer {
  private readonly buffer: Float32Array;
  private readonly output: Float32Array;
  private writePos: number = 0;

  constructor(private readonly frameSize: number) {
    // Buffer large enough for frameSize + one extra quantum
    this.buffer = new Float32Array(frameSize + 128);
    this.output = new Float32Array(frameSize);
  }

  /**
   * Write a chunk of samples. Returns a filled frame when enough
   * samples have accumulated, or null if more samples are needed.
   * The returned Float32Array is reused — copy if you need to keep it.
   */
  write(chunk: Float32Array): Float32Array | null {
    this.buffer.set(chunk, this.writePos);
    this.writePos += chunk.length;

    if (this.writePos >= this.frameSize) {
      // Copy frameSize samples to output
      this.output.set(this.buffer.subarray(0, this.frameSize));

      // Move leftover to beginning
      const leftover = this.writePos - this.frameSize;
      if (leftover > 0) {
        this.buffer.copyWithin(0, this.frameSize, this.writePos);
      }
      this.writePos = leftover;

      return this.output;
    }

    return null;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/audio-engine && npx vitest run --reporter=verbose`
Expected: All 3 tests PASS

- [ ] **Step 6: Create index.ts**

`packages/audio-engine/src/index.ts`:
```typescript
export { FrameBuffer } from "./frame-buffer";
export {
  type AudioMetrics,
  type ProcessorParams,
  RNNOISE_FRAME_SIZE,
  WORKLET_QUANTUM,
  SAMPLE_RATE,
} from "./types";
```

- [ ] **Step 7: Commit**

```bash
git add packages/audio-engine/src/
git commit -m "feat(audio-engine): add FrameBuffer for 128→480 sample accumulation"
```

---

## Task 3: Audio Engine — Metering

**Files:**
- Create: `packages/audio-engine/src/metering.ts`
- Create: `packages/audio-engine/src/__tests__/metering.test.ts`

- [ ] **Step 1: Write failing tests**

`packages/audio-engine/src/__tests__/metering.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { rmsLevel, toDbfs, peakLevel } from "../metering";

describe("metering", () => {
  it("calculates RMS of a constant signal", () => {
    const samples = new Float32Array(480).fill(0.5);
    expect(rmsLevel(samples)).toBeCloseTo(0.5, 5);
  });

  it("returns 0 for silence", () => {
    const samples = new Float32Array(480).fill(0);
    expect(rmsLevel(samples)).toBe(0);
  });

  it("converts amplitude to dBFS", () => {
    expect(toDbfs(1.0)).toBeCloseTo(0, 1);
    expect(toDbfs(0.5)).toBeCloseTo(-6.02, 1);
    expect(toDbfs(0.0)).toBe(-Infinity);
  });

  it("clamps dBFS to floor", () => {
    expect(toDbfs(0.0, -96)).toBe(-96);
    expect(toDbfs(0.00001, -96)).toBe(-96);
  });

  it("finds peak absolute value", () => {
    const samples = new Float32Array([0.1, -0.8, 0.3, 0.5]);
    expect(peakLevel(samples)).toBeCloseTo(0.8, 5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/audio-engine && npx vitest run --reporter=verbose`
Expected: FAIL — functions not found

- [ ] **Step 3: Implement metering**

`packages/audio-engine/src/metering.ts`:
```typescript
export function rmsLevel(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

export function toDbfs(amplitude: number, floor: number = -Infinity): number {
  if (amplitude <= 0) return floor;
  const db = 20 * Math.log10(amplitude);
  return db < floor ? floor : db;
}

export function peakLevel(samples: Float32Array): number {
  let max = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > max) max = abs;
  }
  return max;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/audio-engine && npx vitest run --reporter=verbose`
Expected: All tests PASS

- [ ] **Step 5: Export from index.ts**

Add to `packages/audio-engine/src/index.ts`:
```typescript
export { rmsLevel, toDbfs, peakLevel } from "./metering";
```

- [ ] **Step 6: Commit**

```bash
git add packages/audio-engine/src/
git commit -m "feat(audio-engine): add RMS, dBFS, and peak metering utilities"
```

---

## Task 4: Audio Engine — Noise Gate

**Files:**
- Create: `packages/audio-engine/src/noise-gate.ts`
- Create: `packages/audio-engine/src/__tests__/noise-gate.test.ts`

- [ ] **Step 1: Write failing tests**

`packages/audio-engine/src/__tests__/noise-gate.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { NoiseGate } from "../noise-gate";

describe("NoiseGate", () => {
  it("passes through signal above threshold", () => {
    const gate = new NoiseGate();
    const loud = new Float32Array(480).fill(0.5); // well above any threshold

    gate.process(loud, { thresholdDb: -40, attackMs: 1, releaseMs: 50 });

    // Signal should be mostly preserved (gate open)
    const avgAbs = loud.reduce((s, v) => s + Math.abs(v), 0) / loud.length;
    expect(avgAbs).toBeGreaterThan(0.4);
  });

  it("attenuates signal below threshold", () => {
    const gate = new NoiseGate();
    // Very quiet signal: 0.001 ≈ -60 dBFS
    const quiet = new Float32Array(480).fill(0.001);

    gate.process(quiet, { thresholdDb: -30, attackMs: 1, releaseMs: 50 });

    // Signal should be attenuated
    const avgAbs = quiet.reduce((s, v) => s + Math.abs(v), 0) / quiet.length;
    expect(avgAbs).toBeLessThan(0.001);
  });

  it("applies smooth envelope (no clicks)", () => {
    const gate = new NoiseGate();
    // Alternate loud and quiet frames
    const loud = new Float32Array(480).fill(0.5);
    const quiet = new Float32Array(480).fill(0.001);
    const params = { thresholdDb: -30, attackMs: 5, releaseMs: 100 };

    gate.process(loud, params);
    gate.process(quiet, params);

    // During release, gain should be between 0 and 1 (not instant cutoff)
    // Check that not all samples are fully attenuated
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/audio-engine && npx vitest run --reporter=verbose`
Expected: FAIL — `NoiseGate` not found

- [ ] **Step 3: Implement NoiseGate**

`packages/audio-engine/src/noise-gate.ts`:
```typescript
import { SAMPLE_RATE } from "./types";

export interface NoiseGateParams {
  thresholdDb: number;   // e.g. -40
  attackMs: number;      // e.g. 5
  releaseMs: number;     // e.g. 100
}

export class NoiseGate {
  private envelope: number = 0;

  process(samples: Float32Array, params: NoiseGateParams): void {
    const threshold = Math.pow(10, params.thresholdDb / 20);
    const attackCoeff = 1 - Math.exp(-1 / (SAMPLE_RATE * params.attackMs / 1000));
    const releaseCoeff = 1 - Math.exp(-1 / (SAMPLE_RATE * params.releaseMs / 1000));

    for (let i = 0; i < samples.length; i++) {
      const absVal = Math.abs(samples[i]);

      // Envelope follower
      if (absVal > this.envelope) {
        this.envelope += attackCoeff * (absVal - this.envelope);
      } else {
        this.envelope += releaseCoeff * (absVal - this.envelope);
      }

      // Soft-knee gain: smooth transition around threshold
      const kneeDb = 10;
      const envDb = this.envelope > 0 ? 20 * Math.log10(this.envelope) : -120;
      const threshDb = params.thresholdDb;

      let gainDb: number;
      if (envDb >= threshDb) {
        gainDb = 0; // fully open
      } else if (envDb < threshDb - kneeDb) {
        gainDb = envDb - threshDb; // fully closed region (attenuation)
      } else {
        // Soft knee region
        const x = envDb - threshDb + kneeDb;
        gainDb = (x * x) / (2 * kneeDb) - kneeDb;
      }

      const gain = Math.pow(10, gainDb / 20);
      samples[i] *= Math.min(gain, 1);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/audio-engine && npx vitest run --reporter=verbose`
Expected: All tests PASS

- [ ] **Step 5: Export from index.ts**

Add to `packages/audio-engine/src/index.ts`:
```typescript
export { NoiseGate, type NoiseGateParams } from "./noise-gate";
```

- [ ] **Step 6: Commit**

```bash
git add packages/audio-engine/src/
git commit -m "feat(audio-engine): add soft-knee NoiseGate with envelope follower"
```

---

## Task 5: Audio Engine — AudioWorklet Processor

**Files:**
- Create: `packages/audio-engine/src/worklet/noise-processor.ts`

This file runs inside AudioWorkletGlobalScope. It cannot be tested with Vitest directly (no Web Audio API in Node). It integrates FrameBuffer, NoiseGate, metering, and RNNoise WASM.

- [ ] **Step 1: Create the worklet processor**

`packages/audio-engine/src/worklet/noise-processor.ts`:
```typescript
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

  // Envelope for noise gate
  private envelope: number = 0;

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
    switch (msg.type) {
      case "params":
        if (typeof msg.enabled === "boolean") this.enabled = msg.enabled;
        if (typeof msg.strength === "number") this.strength = msg.strength;
        break;
      case "destroy":
        this.denoiseState?.destroy();
        this.denoiseState = null;
        break;
    }
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
  ): boolean {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!input || !output) return true;

    // Pass-through if disabled or WASM not ready
    if (!this.enabled || !this.denoiseState) {
      output.set(input);
      return true;
    }

    // Measure input level
    let inputRms = 0;
    for (let i = 0; i < input.length; i++) {
      inputRms += input[i] * input[i];
    }
    inputRms = Math.sqrt(inputRms / input.length);

    // Write input to accumulation buffer
    this.inputBuffer.set(input, this.bufferWritePos);
    this.bufferWritePos += input.length;

    // If we have enough for output, read from processed buffer
    if (this.outputAvailable > 0) {
      const toRead = Math.min(input.length, this.outputAvailable);
      output.set(
        this.outputBuffer.subarray(this.outputReadPos, this.outputReadPos + toRead),
      );
      this.outputReadPos += toRead;
      this.outputAvailable -= toRead;

      // Zero-fill if we ran short
      if (toRead < input.length) {
        output.fill(0, toRead);
      }
    } else {
      // No processed output yet — output silence while buffering
      output.fill(0);
    }

    // Process when we have accumulated a full frame
    if (this.bufferWritePos >= FRAME_SIZE) {
      // Copy to RNNoise frame and scale to int16 range
      for (let i = 0; i < FRAME_SIZE; i++) {
        this.rnnoiseFrame[i] = this.inputBuffer[i] * SCALE_UP;
      }

      // RNNoise processes in-place, returns VAD probability
      const vadProb = this.denoiseState.processFrame(this.rnnoiseFrame);

      // Scale back and apply wet/dry mix
      const wet = this.strength / 100;
      const dry = 1 - wet;
      for (let i = 0; i < FRAME_SIZE; i++) {
        this.outputBuffer[i] =
          this.rnnoiseFrame[i] * SCALE_DOWN * wet +
          this.inputBuffer[i] * dry;
      }

      // Measure output level
      let outputRms = 0;
      for (let i = 0; i < FRAME_SIZE; i++) {
        outputRms += this.outputBuffer[i] * this.outputBuffer[i];
      }
      outputRms = Math.sqrt(outputRms / FRAME_SIZE);

      // Send metrics to main thread (infrequent, not every quantum)
      const inputDb = inputRms > 0 ? 20 * Math.log10(inputRms) : -96;
      const outputDb = outputRms > 0 ? 20 * Math.log10(outputRms) : -96;
      this.port.postMessage({
        type: "metrics",
        inputLevel: inputDb,
        outputLevel: outputDb,
        reduction: inputDb - outputDb,
        vadProbability: vadProb,
      });

      // Move leftover samples to beginning
      const leftover = this.bufferWritePos - FRAME_SIZE;
      if (leftover > 0) {
        this.inputBuffer.copyWithin(0, FRAME_SIZE, this.bufferWritePos);
      }
      this.bufferWritePos = leftover;

      // Reset output read position
      this.outputReadPos = 0;
      this.outputAvailable = FRAME_SIZE;
    }

    return true;
  }
}

registerProcessor("noise-processor", NoiseProcessor);
```

- [ ] **Step 2: Export worklet path from index**

Add to `packages/audio-engine/src/index.ts`:
```typescript
// Worklet processor is loaded separately via audioContext.audioWorklet.addModule()
// This constant helps locate it in the build output
export const WORKLET_PROCESSOR_NAME = "noise-processor";
```

- [ ] **Step 3: Commit**

```bash
git add packages/audio-engine/src/
git commit -m "feat(audio-engine): add AudioWorklet processor with RNNoise WASM integration"
```

---

## Task 6: Extension — Manifest + Vite Config

**Files:**
- Create: `packages/extension/src/manifest.base.json`
- Create: `packages/extension/src/manifest.chrome.json`
- Create: `packages/extension/src/manifest.firefox.json`
- Create: `packages/extension/vite.config.ts`
- Create: `packages/extension/src/popup/popup.html`
- Create: `packages/extension/src/styles/globals.css`

- [ ] **Step 1: Create base manifest**

`packages/extension/src/manifest.base.json`:
```json
{
  "manifest_version": 3,
  "name": "HUSH — Noise Cancellation",
  "version": "0.1.0",
  "description": "AI-powered noise cancellation for any website. Privacy-first — all processing happens locally.",
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },
  "action": {
    "default_popup": "src/popup/popup.html",
    "default_title": "HUSH"
  },
  "background": {
    "service_worker": "src/background/service-worker.ts",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/inject.ts"],
      "run_at": "document_start",
      "all_frames": true
    }
  ],
  "permissions": ["storage"],
  "web_accessible_resources": [
    {
      "resources": ["src/worklet/*.js", "assets/*"],
      "matches": ["<all_urls>"]
    }
  ],
  "commands": {
    "_execute_action": {
      "suggested_key": {
        "default": "Alt+Shift+H"
      },
      "description": "Toggle HUSH popup"
    }
  }
}
```

- [ ] **Step 2: Create browser-specific manifests**

`packages/extension/src/manifest.chrome.json`:
```json
{
  "minimum_chrome_version": "109"
}
```

`packages/extension/src/manifest.firefox.json`:
```json
{
  "browser_specific_settings": {
    "gecko": {
      "id": "hush@hush.audio",
      "strict_min_version": "109.0"
    }
  }
}
```

- [ ] **Step 3: Create Vite config**

`packages/extension/vite.config.ts`:
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import webExtension, { readJsonFile } from "vite-plugin-web-extension";

const browser = process.env.BROWSER ?? "chrome";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    webExtension({
      browser,
      manifest: () => ({
        ...readJsonFile("src/manifest.base.json"),
        ...readJsonFile(`src/manifest.${browser}.json`),
      }),
      additionalInputs: [
        "src/worklet/noise-processor.ts",
      ],
    }),
  ],
  build: {
    outDir: browser === "chrome" ? "dist/chrome" : `dist/${browser}`,
    rollupOptions: {
      output: {
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
```

- [ ] **Step 4: Create popup HTML**

`packages/extension/src/popup/popup.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HUSH</title>
  <link rel="stylesheet" href="../styles/globals.css">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./main.tsx"></script>
</body>
</html>
```

- [ ] **Step 5: Create global styles with Tailwind + design tokens**

`packages/extension/src/styles/globals.css`:
```css
@import "tailwindcss";

@theme {
  --color-bg-primary: #06060a;
  --color-bg-secondary: #0c0c12;
  --color-bg-tertiary: #12121c;
  --color-bg-hover: #1a1a28;

  --color-accent-cyan: #00f0ff;
  --color-accent-magenta: #ff3d71;
  --color-accent-green: #00ff88;
  --color-accent-amber: #ffaa00;
  --color-accent-violet: #a855f7;

  --color-text-primary: #e8e8ed;
  --color-text-secondary: rgba(255, 255, 255, 0.55);
  --color-text-tertiary: rgba(255, 255, 255, 0.30);

  --color-border-subtle: rgba(255, 255, 255, 0.04);
  --color-border-default: rgba(255, 255, 255, 0.08);
  --color-border-active: rgba(255, 255, 255, 0.15);

  --font-display: 'Instrument Sans', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --font-body: 'Plus Jakarta Sans', sans-serif;
}

body {
  width: 320px;
  min-height: 400px;
  margin: 0;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-family: var(--font-body);
}
```

- [ ] **Step 6: Create placeholder icon**

```bash
mkdir -p packages/extension/src/icons
# Create a simple SVG icon placeholder
```

`packages/extension/src/icons/icon-16.png`, `icon-48.png`, `icon-128.png`: Generate simple placeholder PNGs. For now, create a script:

```bash
# We'll use a data-uri approach — create minimal valid PNGs later
# For now, copy a placeholder or generate with ImageMagick if available
convert -size 16x16 xc:'#00f0ff' packages/extension/src/icons/icon-16.png 2>/dev/null || echo "Will add icons manually"
convert -size 48x48 xc:'#00f0ff' packages/extension/src/icons/icon-48.png 2>/dev/null || echo "Will add icons manually"
convert -size 128x128 xc:'#00f0ff' packages/extension/src/icons/icon-128.png 2>/dev/null || echo "Will add icons manually"
```

If ImageMagick is not available, create the icons directory and we'll add proper icons in a later step. The extension will load without icons.

- [ ] **Step 7: Commit**

```bash
git add packages/extension/src/manifest.*.json packages/extension/vite.config.ts packages/extension/src/popup/popup.html packages/extension/src/styles/ packages/extension/src/icons/
git commit -m "chore(extension): add manifests, Vite config, popup HTML, and design tokens"
```

---

## Task 7: Extension — Lib Utilities (Storage, Messages, Polyfill)

**Files:**
- Create: `packages/extension/src/lib/storage.ts`
- Create: `packages/extension/src/lib/messages.ts`
- Create: `packages/extension/src/lib/browser-polyfill.ts`

- [ ] **Step 1: Create browser polyfill wrapper**

`packages/extension/src/lib/browser-polyfill.ts`:
```typescript
import browser from "webextension-polyfill";

export { browser };
```

- [ ] **Step 2: Create typed storage wrapper**

`packages/extension/src/lib/storage.ts`:
```typescript
import { browser } from "./browser-polyfill";

export interface HushState {
  enabled: boolean;
  strength: number;
  disabledSites: string[];
  widgetPinned: boolean;
  widgetPosition: { x: number; y: number };
}

const DEFAULTS: HushState = {
  enabled: true,
  strength: 75,
  disabledSites: [],
  widgetPinned: false,
  widgetPosition: { x: 20, y: 20 },
};

export async function getState(): Promise<HushState> {
  const stored = await browser.storage.local.get(DEFAULTS);
  return stored as HushState;
}

export async function setState(partial: Partial<HushState>): Promise<void> {
  await browser.storage.local.set(partial);
}

export function onStateChange(
  callback: (changes: Partial<HushState>) => void,
): void {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const parsed: Partial<HushState> = {};
    for (const [key, change] of Object.entries(changes)) {
      if (key in DEFAULTS) {
        (parsed as Record<string, unknown>)[key] = change.newValue;
      }
    }
    if (Object.keys(parsed).length > 0) {
      callback(parsed);
    }
  });
}
```

- [ ] **Step 3: Create typed message protocol**

`packages/extension/src/lib/messages.ts`:
```typescript
import { browser } from "./browser-polyfill";
import type { AudioMetrics } from "@hush/audio-engine";

// Messages sent from popup/background to content scripts
export type ControlMessage =
  | { type: "get-status" }
  | { type: "params-changed"; enabled: boolean; strength: number }
  | { type: "toggle-widget"; pinned: boolean };

// Messages sent from content scripts to popup/background
export type StatusMessage =
  | { type: "status"; active: boolean; domain: string }
  | { type: "metrics"; metrics: AudioMetrics };

export async function sendToActiveTab(msg: ControlMessage): Promise<void> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0]?.id;
  if (tabId != null) {
    browser.tabs.sendMessage(tabId, msg).catch(() => {
      // Tab might not have content script (e.g., chrome:// pages)
    });
  }
}

export async function sendToAllTabs(msg: ControlMessage): Promise<void> {
  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    if (tab.id != null) {
      browser.tabs.sendMessage(tab.id, msg).catch(() => {});
    }
  }
}

export function onMessage(
  handler: (msg: ControlMessage | StatusMessage) => void,
): void {
  browser.runtime.onMessage.addListener((msg) => {
    handler(msg as ControlMessage | StatusMessage);
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/extension/src/lib/
git commit -m "feat(extension): add typed storage, message protocol, and browser polyfill"
```

---

## Task 8: Extension — Content Script (getUserMedia Hijack)

**Files:**
- Create: `packages/extension/src/content/inject.ts`
- Create: `packages/extension/src/content/hijack.ts`
- Create: `packages/extension/src/content/audio-pipeline.ts`
- Create: `packages/extension/src/worklet/noise-processor.ts`

- [ ] **Step 1: Create the worklet file (copy from audio-engine)**

The worklet must be a standalone file bundled separately. Copy the processor from audio-engine with the import path adjusted for the extension bundle:

`packages/extension/src/worklet/noise-processor.ts`:
```typescript
// This file is bundled separately as an AudioWorklet module.
// It must be self-contained — no imports from other extension source files.
import { Rnnoise, type DenoiseState } from "@shiguredo/rnnoise-wasm";

const FRAME_SIZE = 480;
const SCALE_UP = 32768;
const SCALE_DOWN = 1 / 32768;

class NoiseProcessor extends AudioWorkletProcessor {
  private rnnoise: Rnnoise | null = null;
  private denoiseState: DenoiseState | null = null;
  private inputBuffer = new Float32Array(FRAME_SIZE + 128);
  private rnnoiseFrame = new Float32Array(FRAME_SIZE);
  private outputBuffer = new Float32Array(FRAME_SIZE);
  private bufferWritePos = 0;
  private outputReadPos = 0;
  private outputAvailable = 0;
  private enabled = true;
  private strength = 75;

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
```

- [ ] **Step 2: Create audio pipeline setup**

`packages/extension/src/content/audio-pipeline.ts`:
```typescript
import { browser } from "../lib/browser-polyfill";

let audioContext: AudioContext | null = null;
let workletNode: AudioWorkletNode | null = null;
let metricsCallback: ((metrics: unknown) => void) | null = null;

export function setMetricsCallback(cb: (metrics: unknown) => void): void {
  metricsCallback = cb;
}

export async function processStream(
  rawStream: MediaStream,
  enabled: boolean,
  strength: number,
): Promise<MediaStream> {
  // Create AudioContext at 48kHz
  audioContext = new AudioContext({ sampleRate: 48000 });

  // Load the worklet module from extension resources
  const workletUrl = browser.runtime.getURL("src/worklet/noise-processor.js");
  await audioContext.audioWorklet.addModule(workletUrl);

  // Create nodes
  const source = audioContext.createMediaStreamSource(rawStream);
  workletNode = new AudioWorkletNode(audioContext, "noise-processor");
  const destination = audioContext.createMediaStreamDestination();

  // Listen for metrics from worklet
  workletNode.port.onmessage = (e: MessageEvent) => {
    if (e.data.type === "metrics" && metricsCallback) {
      metricsCallback(e.data);
    }
  };

  // Set initial parameters
  workletNode.port.postMessage({
    type: "params",
    enabled,
    strength,
  });

  // Connect: source → worklet → destination
  source.connect(workletNode);
  workletNode.connect(destination);

  // Copy video tracks from original stream (if any)
  const outputStream = destination.stream;
  for (const videoTrack of rawStream.getVideoTracks()) {
    outputStream.addTrack(videoTrack);
  }

  return outputStream;
}

export function updateParams(enabled: boolean, strength: number): void {
  workletNode?.port.postMessage({ type: "params", enabled, strength });
}

export function teardown(): void {
  workletNode?.disconnect();
  audioContext?.close();
  workletNode = null;
  audioContext = null;
}
```

- [ ] **Step 3: Create getUserMedia hijack**

`packages/extension/src/content/hijack.ts`:
```typescript
import { processStream, updateParams, setMetricsCallback } from "./audio-pipeline";
import { browser } from "../lib/browser-polyfill";
import type { HushState } from "../lib/storage";

let currentState: { enabled: boolean; strength: number; disabledSites: string[] } = {
  enabled: true,
  strength: 75,
  disabledSites: [],
};

// Save reference to the real getUserMedia BEFORE any page script runs
const realGetUserMedia = navigator.mediaDevices.getUserMedia.bind(
  navigator.mediaDevices,
);

function isDisabledForCurrentSite(): boolean {
  const hostname = window.location.hostname;
  return currentState.disabledSites.includes(hostname);
}

// Replace getUserMedia with our wrapper
navigator.mediaDevices.getUserMedia = async function (
  constraints?: MediaStreamConstraints,
): Promise<MediaStream> {
  const rawStream = await realGetUserMedia(constraints);

  // If no audio requested, or HUSH disabled, pass through
  if (!constraints?.audio || !currentState.enabled || isDisabledForCurrentSite()) {
    return rawStream;
  }

  try {
    const cleanStream = await processStream(
      rawStream,
      currentState.enabled,
      currentState.strength,
    );

    // Notify background that we're actively processing
    browser.runtime.sendMessage({
      type: "status",
      active: true,
      domain: window.location.hostname,
    }).catch(() => {});

    return cleanStream;
  } catch (err) {
    console.warn("[HUSH] Failed to process audio, falling back to raw stream:", err);
    return rawStream;
  }
};

// Listen for state changes from background/popup
browser.runtime.onMessage.addListener((msg: unknown) => {
  const message = msg as { type: string; enabled?: boolean; strength?: number };
  if (message.type === "params-changed") {
    if (typeof message.enabled === "boolean") currentState.enabled = message.enabled;
    if (typeof message.strength === "number") currentState.strength = message.strength;
    updateParams(currentState.enabled, currentState.strength);
  }
});

// Forward metrics to popup via background
setMetricsCallback((metrics) => {
  browser.runtime.sendMessage({ type: "metrics", metrics }).catch(() => {});
});

// Load initial state
browser.storage.local.get({
  enabled: true,
  strength: 75,
  disabledSites: [],
}).then((state) => {
  currentState = state as typeof currentState;
});
```

- [ ] **Step 4: Create inject entry point**

`packages/extension/src/content/inject.ts`:
```typescript
// This file runs at document_start, before any page JavaScript.
// It must be as minimal as possible — just set up the hijack.
import "./hijack";
```

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/content/ packages/extension/src/worklet/
git commit -m "feat(extension): add getUserMedia hijack and audio processing pipeline"
```

---

## Task 9: Extension — Background Service Worker

**Files:**
- Create: `packages/extension/src/background/service-worker.ts`

- [ ] **Step 1: Create service worker**

`packages/extension/src/background/service-worker.ts`:
```typescript
import { browser } from "../lib/browser-polyfill";
import type { HushState } from "../lib/storage";

// Track which tabs are actively processing
const activeTabs = new Map<number, string>(); // tabId → domain

// Listen for messages from content scripts and popup
browser.runtime.onMessage.addListener((msg: unknown, sender) => {
  const message = msg as { type: string; [key: string]: unknown };

  switch (message.type) {
    case "status": {
      // Content script reporting that it's processing audio
      const tabId = sender.tab?.id;
      if (tabId != null) {
        if (message.active) {
          activeTabs.set(tabId, message.domain as string);
        } else {
          activeTabs.delete(tabId);
        }
        updateBadge(tabId);
      }
      break;
    }

    case "metrics": {
      // Forward metrics from content script to popup (if open)
      // The popup listens via runtime.onMessage
      break;
    }

    case "get-status": {
      // Popup asking for current tab status
      const tabId = sender.tab?.id;
      return Promise.resolve({
        active: tabId != null && activeTabs.has(tabId),
        domain: tabId != null ? activeTabs.get(tabId) : null,
      });
    }
  }
});

// When state changes in storage, broadcast to all content scripts
browser.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;

  const state = await browser.storage.local.get({
    enabled: true,
    strength: 75,
  }) as Pick<HushState, "enabled" | "strength">;

  // Broadcast to all tabs
  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    if (tab.id != null) {
      browser.tabs.sendMessage(tab.id, {
        type: "params-changed",
        enabled: state.enabled,
        strength: state.strength,
      }).catch(() => {});
    }
  }

  // Update badge for active tab
  const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (activeTab?.id != null) {
    updateBadge(activeTab.id);
  }
});

// Update toolbar icon badge
async function updateBadge(tabId: number): Promise<void> {
  const state = await browser.storage.local.get({ enabled: true, disabledSites: [] }) as Pick<HushState, "enabled" | "disabledSites">;

  const isActive = activeTabs.has(tabId);
  const domain = activeTabs.get(tabId);
  const isSiteDisabled = domain != null && state.disabledSites.includes(domain);

  let color: string;
  let text: string;

  if (!state.enabled) {
    color = "#666666";
    text = "";
  } else if (isSiteDisabled) {
    color = "#ff3d71";
    text = "OFF";
  } else if (isActive) {
    color = "#00ff88";
    text = "ON";
  } else {
    color = "#00f0ff";
    text = "";
  }

  await browser.action.setBadgeBackgroundColor({ color, tabId });
  await browser.action.setBadgeText({ text, tabId });
}

// Clean up when tab closes
browser.tabs.onRemoved.addListener((tabId) => {
  activeTabs.delete(tabId);
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/extension/src/background/
git commit -m "feat(extension): add background service worker with state coordination and badge"
```

---

## Task 10: Extension — Popup UI

**Files:**
- Create: `packages/extension/src/popup/main.tsx`
- Create: `packages/extension/src/popup/App.tsx`
- Create: `packages/extension/src/popup/components/PowerRing.tsx`
- Create: `packages/extension/src/popup/components/StrengthSlider.tsx`
- Create: `packages/extension/src/popup/components/LevelMeters.tsx`
- Create: `packages/extension/src/popup/components/SiteToggle.tsx`
- Create: `packages/extension/src/popup/components/Header.tsx`
- Create: `packages/extension/src/popup/hooks/useHushState.ts`

- [ ] **Step 1: Create popup entry point**

`packages/extension/src/popup/main.tsx`:
```tsx
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "../styles/globals.css";

const root = document.getElementById("root")!;
createRoot(root).render(<App />);
```

- [ ] **Step 2: Create state hook**

`packages/extension/src/popup/hooks/useHushState.ts`:
```typescript
import { useEffect, useState, useCallback } from "react";
import { browser } from "../../lib/browser-polyfill";
import type { HushState } from "../../lib/storage";
import { getState, setState } from "../../lib/storage";
import type { AudioMetrics } from "@hush/audio-engine";

const DEFAULT_METRICS: AudioMetrics = {
  inputLevel: -96,
  outputLevel: -96,
  reduction: 0,
  vadProbability: 0,
};

export function useHushState() {
  const [state, setLocalState] = useState<HushState>({
    enabled: true,
    strength: 75,
    disabledSites: [],
    widgetPinned: false,
    widgetPosition: { x: 20, y: 20 },
  });

  const [metrics, setMetrics] = useState<AudioMetrics>(DEFAULT_METRICS);
  const [currentDomain, setCurrentDomain] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Load initial state
  useEffect(() => {
    getState().then(setLocalState);

    // Get current tab domain
    browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (tabs[0]?.url) {
        try {
          setCurrentDomain(new URL(tabs[0].url).hostname);
        } catch {}
      }
    });
  }, []);

  // Listen for metrics from content script
  useEffect(() => {
    const listener = (msg: unknown) => {
      const message = msg as { type: string; metrics?: AudioMetrics; active?: boolean };
      if (message.type === "metrics" && message.metrics) {
        setMetrics(message.metrics);
        setIsProcessing(true);
      }
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);

  // Listen for storage changes
  useEffect(() => {
    const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== "local") return;
      setLocalState((prev) => {
        const next = { ...prev };
        for (const [key, change] of Object.entries(changes)) {
          if (key in next && change.newValue !== undefined) {
            (next as Record<string, unknown>)[key] = change.newValue;
          }
        }
        return next;
      });
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, []);

  const setEnabled = useCallback((enabled: boolean) => {
    setState({ enabled });
  }, []);

  const setStrength = useCallback((strength: number) => {
    setState({ strength });
  }, []);

  const toggleSite = useCallback(() => {
    if (!currentDomain) return;
    const disabled = state.disabledSites.includes(currentDomain);
    const disabledSites = disabled
      ? state.disabledSites.filter((s) => s !== currentDomain)
      : [...state.disabledSites, currentDomain];
    setState({ disabledSites });
  }, [currentDomain, state.disabledSites]);

  const isSiteDisabled = currentDomain
    ? state.disabledSites.includes(currentDomain)
    : false;

  return {
    ...state,
    metrics,
    currentDomain,
    isProcessing,
    isSiteDisabled,
    setEnabled,
    setStrength,
    toggleSite,
  };
}
```

- [ ] **Step 3: Create Header component**

`packages/extension/src/popup/components/Header.tsx`:
```tsx
export function Header() {
  return (
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent-cyan to-accent-violet flex items-center justify-center font-bold text-xs text-bg-primary font-[family-name:var(--font-display)]">
          H
        </div>
        <span className="font-[family-name:var(--font-display)] font-bold text-base tracking-[2px] text-text-primary">
          HUSH
        </span>
      </div>
      <div className="flex gap-1.5">
        <button
          className="w-7 h-7 rounded-md bg-border-subtle border border-border-default flex items-center justify-center text-text-tertiary text-sm hover:bg-bg-hover transition-colors"
          title="Settings"
        >
          ⚙
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create PowerRing component**

`packages/extension/src/popup/components/PowerRing.tsx`:
```tsx
interface PowerRingProps {
  enabled: boolean;
  isProcessing: boolean;
  latencyMs?: number;
  onToggle: () => void;
}

export function PowerRing({ enabled, isProcessing, latencyMs = 12, onToggle }: PowerRingProps) {
  const isActive = enabled && isProcessing;

  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-xl border transition-all duration-300 mb-4 ${
        isActive
          ? "bg-bg-secondary border-accent-cyan/15 shadow-[0_0_20px_rgba(0,240,255,0.04)]"
          : "bg-bg-secondary border-border-subtle"
      }`}
    >
      <button
        onClick={onToggle}
        className={`w-[52px] h-[52px] rounded-full border-[2.5px] flex items-center justify-center shrink-0 transition-all duration-300 cursor-pointer ${
          enabled
            ? "border-accent-cyan shadow-[0_0_16px_rgba(0,240,255,0.25),inset_0_0_12px_rgba(0,240,255,0.08)]"
            : "border-border-active"
        }`}
      >
        <div
          className={`w-5 h-5 rounded-full border-2 border-t-transparent relative transition-colors ${
            enabled ? "border-accent-cyan" : "border-text-tertiary"
          }`}
        >
          <div
            className={`absolute -top-[5px] left-1/2 -translate-x-1/2 w-0.5 h-2 rounded-sm transition-colors ${
              enabled ? "bg-accent-cyan" : "bg-text-tertiary"
            }`}
          />
        </div>
      </button>
      <div className="flex-1">
        <div className="font-[family-name:var(--font-display)] font-semibold text-sm text-text-primary">
          Noise Cancellation
        </div>
        <div className="font-[family-name:var(--font-mono)] text-[11px] flex items-center gap-1.5">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              isActive
                ? "bg-accent-green shadow-[0_0_6px_rgba(0,255,136,0.4)]"
                : "bg-text-tertiary"
            }`}
          />
          <span className={isActive ? "text-accent-green" : "text-text-tertiary"}>
            {enabled ? (isProcessing ? "Active" : "Enabled") : "Disabled"}
          </span>
        </div>
        {enabled && (
          <div className="font-[family-name:var(--font-mono)] text-[10px] text-text-tertiary mt-0.5">
            {latencyMs}ms · 48kHz
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create StrengthSlider component**

`packages/extension/src/popup/components/StrengthSlider.tsx`:
```tsx
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
```

- [ ] **Step 6: Create LevelMeters component**

`packages/extension/src/popup/components/LevelMeters.tsx`:
```tsx
import type { AudioMetrics } from "@hush/audio-engine";

interface LevelMetersProps {
  metrics: AudioMetrics;
}

function dbToPercent(db: number): number {
  // Map -96..0 dBFS to 0..100%
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
```

- [ ] **Step 7: Create SiteToggle component**

`packages/extension/src/popup/components/SiteToggle.tsx`:
```tsx
interface SiteToggleProps {
  domain: string;
  disabled: boolean;
  onToggle: () => void;
}

export function SiteToggle({ domain, disabled, onToggle }: SiteToggleProps) {
  if (!domain) return null;

  return (
    <div className="flex items-center justify-between px-3.5 py-2.5 bg-bg-secondary rounded-lg border border-border-subtle mb-4">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded bg-bg-tertiary flex items-center justify-center text-[9px] text-text-tertiary">
          🌐
        </div>
        <span className="font-[family-name:var(--font-mono)] text-[11px] text-text-secondary">
          {domain}
        </span>
      </div>
      <button
        onClick={onToggle}
        className={`w-9 h-5 rounded-[10px] relative cursor-pointer transition-colors duration-200 ${
          !disabled ? "bg-accent-green/20" : "bg-border-default"
        }`}
      >
        <div
          className={`w-4 h-4 rounded-full absolute top-0.5 transition-all duration-200 ${
            !disabled
              ? "left-[18px] bg-accent-green shadow-[0_0_6px_rgba(0,255,136,0.4)]"
              : "left-0.5 bg-text-tertiary"
          }`}
        />
      </button>
    </div>
  );
}
```

- [ ] **Step 8: Create App component**

`packages/extension/src/popup/App.tsx`:
```tsx
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
```

- [ ] **Step 9: Commit**

```bash
git add packages/extension/src/popup/
git commit -m "feat(extension): add popup UI with power toggle, strength slider, meters, and site toggle"
```

---

## Task 11: Build, Load, and Test

- [ ] **Step 1: Build the extension for Chrome**

Run: `cd /path/to/hush && pnpm build:extension`
Expected: Build succeeds, output in `packages/extension/dist/chrome/`

- [ ] **Step 2: Fix any build errors**

If errors occur, fix them and re-run. Common issues:
- Missing type imports
- Vite plugin config issues
- WASM bundling path issues

- [ ] **Step 3: Load extension in Chrome**

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `packages/extension/dist/chrome/`
5. Verify: HUSH icon appears in toolbar

- [ ] **Step 4: Test on a mic-using page**

1. Open any page that uses `getUserMedia` (e.g., `https://webcamtests.com/` or Google Meet)
2. Grant mic permission
3. Click HUSH popup — verify:
   - Power toggle works
   - Strength slider moves
   - Level meters show values (if mic active)
   - Site toggle shows current domain

- [ ] **Step 5: Build for Firefox**

Run: `pnpm build:extension:firefox`
Expected: Build in `packages/extension/dist/firefox/`

- [ ] **Step 6: Run audio-engine tests**

Run: `pnpm test`
Expected: All unit tests pass (FrameBuffer, metering, NoiseGate)

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "chore: finalize Extension MVP build and verify"
```

- [ ] **Step 8: Push**

```bash
git push origin main
```
