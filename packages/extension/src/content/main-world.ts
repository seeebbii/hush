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

// Audio pipeline — pre-initialized on page load
let audioContext: AudioContext | null = null;
let workletNode: AudioWorkletNode | null = null;
let currentSource: MediaStreamAudioSourceNode | null = null;
let currentDestination: MediaStreamAudioDestinationNode | null = null;
let cachedOutputStream: MediaStream | null = null; // Reuse across device switches
let pipelineReady = false;
let pipelineInitializing = false;

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

// Pre-initialize the pipeline on page load so getUserMedia is instant
async function initPipeline(): Promise<boolean> {
  if (pipelineReady) return true;
  if (pipelineInitializing) {
    // Wait for in-progress init
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (pipelineReady || !pipelineInitializing) {
          clearInterval(check);
          resolve(pipelineReady);
        }
      }, 50);
    });
  }

  const workletUrl = getWorkletUrl();
  if (!workletUrl) return false;

  pipelineInitializing = true;

  try {
    audioContext = new AudioContext({ sampleRate: 48000 });

    if (audioContext.state === "suspended") {
      // Can't resume without user gesture — will resume on first getUserMedia
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

    pipelineReady = true;
    pipelineInitializing = false;
    console.log("[HUSH] Audio pipeline pre-initialized");
    return true;
  } catch (err) {
    console.error("[HUSH] Failed to pre-initialize pipeline:", err);
    pipelineInitializing = false;
    return false;
  }
}

// Start pre-initialization immediately (don't await — runs in background)
initPipeline();

// Save real getUserMedia
const realGetUserMedia = navigator.mediaDevices.getUserMedia.bind(
  navigator.mediaDevices,
);

navigator.mediaDevices.getUserMedia = async function (
  constraints?: MediaStreamConstraints,
): Promise<MediaStream> {
  const rawStream = await realGetUserMedia(constraints);

  if (!constraints?.audio || !config.enabled || isDisabledForSite()) {
    return rawStream;
  }

  // Ensure pipeline is ready (should already be from pre-init)
  if (!pipelineReady) {
    const ready = await initPipeline();
    if (!ready || !audioContext || !workletNode || !currentDestination) {
      console.warn("[HUSH] Pipeline not ready, passing through");
      return rawStream;
    }
  }

  try {
    // Resume AudioContext if suspended (needs user gesture — getUserMedia counts)
    if (audioContext!.state === "suspended") {
      await audioContext!.resume();
    }

    // Disconnect previous source if switching mics
    if (currentSource) {
      try { currentSource.disconnect(); } catch {}
    }

    // Connect new source — pipeline is already set up, this is instant
    currentSource = audioContext!.createMediaStreamSource(rawStream);
    currentSource.connect(workletNode!);

    // Reuse the same output stream across device switches
    // This prevents "new stream already has a track" errors in apps
    if (!cachedOutputStream) {
      cachedOutputStream = new MediaStream(currentDestination!.stream.getAudioTracks());
    }

    // Build output: reuse cached audio tracks + fresh video tracks
    const outputStream = new MediaStream(cachedOutputStream.getAudioTracks());
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

console.log("[HUSH] getUserMedia hijack installed");
