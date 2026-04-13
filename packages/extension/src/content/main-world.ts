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

// Read initial state from dataset (may or may not be set yet by bridge)
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

// Read worklet URL LAZILY — bridge may set it after this script loads
function getWorkletUrl(): string | undefined {
  return document.documentElement.dataset.hushWorkletUrl;
}

// Save reference to the REAL getUserMedia BEFORE any page script runs
const realGetUserMedia = navigator.mediaDevices.getUserMedia.bind(
  navigator.mediaDevices,
);

// Replace with our wrapper
navigator.mediaDevices.getUserMedia = async function (
  constraints?: MediaStreamConstraints,
): Promise<MediaStream> {
  console.log("[HUSH] getUserMedia called with constraints:", constraints);

  // Call the real getUserMedia first
  const rawStream = await realGetUserMedia(constraints);

  // Skip if no audio requested
  if (!constraints?.audio) {
    console.log("[HUSH] No audio requested, passing through");
    return rawStream;
  }

  // Skip if disabled
  if (!config.enabled) {
    console.log("[HUSH] Disabled globally, passing through");
    return rawStream;
  }

  // Skip if disabled for this site
  if (isDisabledForSite()) {
    console.log("[HUSH] Disabled for", window.location.hostname);
    return rawStream;
  }

  // Read worklet URL lazily (bridge may have set it after initial load)
  const workletUrl = getWorkletUrl();
  if (!workletUrl) {
    console.warn("[HUSH] No worklet URL available, passing through raw stream");
    return rawStream;
  }

  console.log("[HUSH] Processing stream, worklet URL:", workletUrl);

  try {
    // Create AudioContext at 48kHz (required by RNNoise)
    audioContext = new AudioContext({ sampleRate: 48000 });
    console.log("[HUSH] AudioContext created, state:", audioContext.state);

    // Resume if suspended (some browsers require user gesture)
    if (audioContext.state === "suspended") {
      await audioContext.resume();
      console.log("[HUSH] AudioContext resumed");
    }

    // Load the AudioWorklet processor
    console.log("[HUSH] Loading AudioWorklet module...");
    await audioContext.audioWorklet.addModule(workletUrl);
    console.log("[HUSH] AudioWorklet module loaded");

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

    console.log(
      "[HUSH] Noise cancellation active on",
      window.location.hostname,
    );
    return outputStream;
  } catch (err) {
    console.error("[HUSH] Failed to process audio:", err);
    console.warn("[HUSH] Falling back to raw stream");
    return rawStream;
  }
};

console.log("[HUSH] getUserMedia hijack installed (worklet URL will be read lazily)");
