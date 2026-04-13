import { processStream, updateParams, setMetricsCallback } from "./audio-pipeline";
import { browser } from "../lib/browser-polyfill";

let currentState: { enabled: boolean; strength: number; disabledSites: string[] } = {
  enabled: true,
  strength: 75,
  disabledSites: [],
};

const realGetUserMedia = navigator.mediaDevices.getUserMedia.bind(
  navigator.mediaDevices,
);

function isDisabledForCurrentSite(): boolean {
  const hostname = window.location.hostname;
  return currentState.disabledSites.includes(hostname);
}

navigator.mediaDevices.getUserMedia = async function (
  constraints?: MediaStreamConstraints,
): Promise<MediaStream> {
  const rawStream = await realGetUserMedia(constraints);

  if (!constraints?.audio || !currentState.enabled || isDisabledForCurrentSite()) {
    return rawStream;
  }

  try {
    const cleanStream = await processStream(
      rawStream,
      currentState.enabled,
      currentState.strength,
    );

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

browser.runtime.onMessage.addListener((msg: unknown) => {
  const message = msg as { type: string; enabled?: boolean; strength?: number };
  if (message.type === "params-changed") {
    if (typeof message.enabled === "boolean") currentState.enabled = message.enabled;
    if (typeof message.strength === "number") currentState.strength = message.strength;
    updateParams(currentState.enabled, currentState.strength);
  }
});

setMetricsCallback((metrics) => {
  browser.runtime.sendMessage({ type: "metrics", metrics }).catch(() => {});
});

browser.storage.local.get({
  enabled: true,
  strength: 75,
  disabledSites: [],
}).then((state) => {
  currentState = state as typeof currentState;
});
