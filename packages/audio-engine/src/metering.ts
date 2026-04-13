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
