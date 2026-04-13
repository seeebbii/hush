import { describe, it, expect } from "vitest";
import { FrameBuffer } from "../frame-buffer";
import { RNNOISE_FRAME_SIZE, WORKLET_QUANTUM } from "../types";

describe("FrameBuffer", () => {
  it("accumulates samples until frame size reached", () => {
    const buffer = new FrameBuffer(RNNOISE_FRAME_SIZE);
    const chunk = new Float32Array(WORKLET_QUANTUM).fill(0.5);
    expect(buffer.write(chunk)).toBe(null);
    expect(buffer.write(chunk)).toBe(null);
    expect(buffer.write(chunk)).toBe(null);
    const frame = buffer.write(chunk);
    expect(frame).not.toBe(null);
    expect(frame!.length).toBe(RNNOISE_FRAME_SIZE);
    expect(frame![0]).toBe(0.5);
  });

  it("preserves leftover samples across frames", () => {
    const buffer = new FrameBuffer(RNNOISE_FRAME_SIZE);
    const chunk = new Float32Array(WORKLET_QUANTUM);
    for (let i = 0; i < WORKLET_QUANTUM; i++) chunk[i] = i;
    buffer.write(chunk);
    buffer.write(chunk);
    buffer.write(chunk);
    const frame = buffer.write(chunk);
    expect(frame).not.toBe(null);
    expect(frame!.length).toBe(480);
    buffer.write(chunk);
    buffer.write(chunk);
    expect(buffer.write(chunk)).toBe(null);
    const frame2 = buffer.write(chunk);
    expect(frame2).not.toBe(null);
    expect(frame2!.length).toBe(480);
  });

  it("returns pre-allocated buffer (no allocation per frame)", () => {
    const buffer = new FrameBuffer(RNNOISE_FRAME_SIZE);
    const chunk = new Float32Array(WORKLET_QUANTUM).fill(1.0);
    buffer.write(chunk); buffer.write(chunk); buffer.write(chunk);
    const frame1 = buffer.write(chunk);
    buffer.write(chunk); buffer.write(chunk); buffer.write(chunk);
    const frame2 = buffer.write(chunk);
    expect(frame1).toBe(frame2); // same reference
  });
});
