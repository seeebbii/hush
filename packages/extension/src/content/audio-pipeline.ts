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
  audioContext = new AudioContext({ sampleRate: 48000 });

  const workletUrl = browser.runtime.getURL("src/worklet/noise-processor.js");
  await audioContext.audioWorklet.addModule(workletUrl);

  const source = audioContext.createMediaStreamSource(rawStream);
  workletNode = new AudioWorkletNode(audioContext, "noise-processor");
  const destination = audioContext.createMediaStreamDestination();

  workletNode.port.onmessage = (e: MessageEvent) => {
    if (e.data.type === "metrics" && metricsCallback) {
      metricsCallback(e.data);
    }
  };

  workletNode.port.postMessage({
    type: "params",
    enabled,
    strength,
  });

  source.connect(workletNode);
  workletNode.connect(destination);

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
