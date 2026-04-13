// Main world script — runs in the PAGE's JavaScript context
// NO access to browser.* extension APIs
// Communicates with bridge.ts via CustomEvents on document.documentElement

interface HushConfig {
  enabled: boolean;
  strength: number;
  disabledSites: string[];
}

// Read worklet URL from dataset (set by bridge.ts before this script runs)
const workletUrl = document.documentElement.dataset.hushWorkletUrl;

// Read initial state from dataset
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
} catch {
  // Use defaults
}

// Listen for state updates from bridge
document.documentElement.addEventListener("hush:state", ((e: CustomEvent) => {
  Object.assign(config, e.detail);
  updateWorkletParams();
}) as EventListener);

// Listen for params changes from bridge
document.documentElement.addEventListener("hush:params", ((e: CustomEvent) => {
  const msg = e.detail;
  if (typeof msg.enabled === "boolean") config.enabled = msg.enabled;
  if (typeof msg.strength === "number") config.strength = msg.strength;
  updateWorkletParams();
}) as EventListener);

// Audio pipeline state
let audioContext: AudioContext | null = null;
let workletNode: AudioWorkletNode | null = null;

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

// Save reference to the REAL getUserMedia BEFORE any page script runs
const realGetUserMedia = navigator.mediaDevices.getUserMedia.bind(
  navigator.mediaDevices,
);

// Replace with our wrapper
navigator.mediaDevices.getUserMedia = async function (
  constraints?: MediaStreamConstraints,
): Promise<MediaStream> {
  // Call the real getUserMedia first
  const rawStream = await realGetUserMedia(constraints);

  // Skip processing if: no audio requested, disabled globally, or disabled for site
  if (
    !constraints?.audio ||
    !config.enabled ||
    isDisabledForSite() ||
    !workletUrl
  ) {
    return rawStream;
  }

  try {
    // Create AudioContext at 48kHz (required by RNNoise)
    audioContext = new AudioContext({ sampleRate: 48000 });

    // Load the AudioWorklet processor
    await audioContext.audioWorklet.addModule(workletUrl);

    // Build the audio graph: source → worklet → destination
    const source = audioContext.createMediaStreamSource(rawStream);
    workletNode = new AudioWorkletNode(audioContext, "noise-processor");
    const destination = audioContext.createMediaStreamDestination();

    // Send initial params
    workletNode.port.postMessage({
      type: "params",
      enabled: config.enabled,
      strength: config.strength,
    });

    // Forward metrics from worklet to bridge (via CustomEvent)
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

    // Connect the graph
    source.connect(workletNode);
    workletNode.connect(destination);

    // Build output stream — pass video tracks through untouched
    const outputStream = destination.stream;
    for (const videoTrack of rawStream.getVideoTracks()) {
      outputStream.addTrack(videoTrack);
    }

    // Notify bridge that we're processing
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
    console.warn(
      "[HUSH] Failed to process audio, falling back to raw stream:",
      err,
    );
    return rawStream;
  }
};

if (workletUrl) {
  console.log("[HUSH] getUserMedia hijack installed");
} else {
  console.warn("[HUSH] No worklet URL — hijack not installed");
}
