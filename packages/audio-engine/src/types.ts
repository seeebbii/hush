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
