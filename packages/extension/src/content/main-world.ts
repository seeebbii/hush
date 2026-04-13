// Main world script — runs in the PAGE's JavaScript context
// NO access to browser.* extension APIs
// Communicates with bridge.ts via CustomEvents on document.documentElement

interface HushConfig {
  enabled: boolean;
  strength: number;
  disabledSites: string[];
}

let config: HushConfig = {
  enabled: true,
  strength: 75,
  disabledSites: [],
};

try {
  const stateStr = document.documentElement.dataset.hushState;
  if (stateStr) {
    Object.assign(config, JSON.parse(stateStr));
  }
} catch {}

document.documentElement.addEventListener("hush:state", ((e: CustomEvent) => {
  Object.assign(config, e.detail);
  updateWorkletParams();
}) as EventListener);

document.documentElement.addEventListener("hush:params", ((e: CustomEvent) => {
  const msg = e.detail;
  if (typeof msg.enabled === "boolean") config.enabled = msg.enabled;
  if (typeof msg.strength === "number") config.strength = msg.strength;
  updateWorkletParams();
}) as EventListener);

// Single shared AudioContext — reused across all getUserMedia calls
let audioContext: AudioContext | null = null;
let workletReady = false;
let workletNode: AudioWorkletNode | null = null;
let currentSource: MediaStreamAudioSourceNode | null = null;
let currentDestination: MediaStreamAudioDestinationNode | null = null;

function updateWorkletParams(): void {
  workletNode?.port.postMessage({
    type: "params",
    enabled: config.enabled,
    strength: config.strength,
  });
}

function isDisabledForSite(): boolean {
  return config.disabledSites.includes(window.location.hostname);
}

function getWorkletUrl(): string | undefined {
  return document.documentElement.dataset.hushWorkletUrl;
}

async function ensureAudioContext(): Promise<boolean> {
  const workletUrl = getWorkletUrl();
  if (!workletUrl) return false;

  if (audioContext && workletReady) return true;

  try {
    audioContext = new AudioContext({ sampleRate: 48000 });

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    await audioContext.audioWorklet.addModule(workletUrl);

    workletNode = new AudioWorkletNode(audioContext, "noise-processor");
    workletNode.port.postMessage({
      type: "params",
      enabled: config.enabled,
      strength: config.strength,
    });

    workletNode.port.onmessage = (e: MessageEvent) => {
      if (e.data.type === "metrics") {
        document.documentElement.dispatchEvent(
          new CustomEvent("hush:metrics", { detail: e.data }),
        );
      } else if (e.data.type === "ready") {
        console.log("[HUSH] RNNoise WASM loaded, processing active");
      } else if (e.data.type === "error") {
        console.error("[HUSH] Worklet error:", e.data.error);
      }
    };

    currentDestination = audioContext.createMediaStreamDestination();
    workletNode.connect(currentDestination);

    workletReady = true;
    console.log("[HUSH] Audio pipeline initialized (single AudioContext)");
    return true;
  } catch (err) {
    console.error("[HUSH] Failed to initialize audio pipeline:", err);
    return false;
  }
}

const realGetUserMedia = navigator.mediaDevices.getUserMedia.bind(
  navigator.mediaDevices,
);

navigator.mediaDevices.getUserMedia = async function (
  constraints?: MediaStreamConstraints,
): Promise<MediaStream> {
  const rawStream = await realGetUserMedia(constraints);

  if (
    !constraints?.audio ||
    !config.enabled ||
    isDisabledForSite()
  ) {
    return rawStream;
  }

  const ready = await ensureAudioContext();
  if (!ready || !audioContext || !workletNode || !currentDestination) {
    console.warn("[HUSH] Pipeline not ready, passing through raw stream");
    return rawStream;
  }

  try {
    // Disconnect previous source if switching mics
    if (currentSource) {
      try {
        currentSource.disconnect();
      } catch {}
    }

    // Connect new source to existing pipeline
    currentSource = audioContext.createMediaStreamSource(rawStream);
    currentSource.connect(workletNode);

    // Build output stream with processed audio + original video tracks
    const outputStream = new MediaStream(currentDestination.stream.getAudioTracks());
    for (const videoTrack of rawStream.getVideoTracks()) {
      outputStream.addTrack(videoTrack);
    }

    document.documentElement.dispatchEvent(
      new CustomEvent("hush:status", {
        detail: {
          type: "status",
          active: true,
          domain: window.location.hostname,
        },
      }),
    );

    console.log("[HUSH] Noise cancellation active on", window.location.hostname);
    return outputStream;
  } catch (err) {
    console.warn("[HUSH] Failed to process audio:", err);
    return rawStream;
  }
};

console.log("[HUSH] getUserMedia hijack installed (worklet URL will be read lazily)");
