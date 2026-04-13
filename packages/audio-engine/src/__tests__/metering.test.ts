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
