// Main world script — runs in the PAGE's JavaScript context
// NO access to browser.* extension APIs
// Communicates with bridge.ts via CustomEvents on document.documentElement

interface HushConfig {
  enabled: boolean;
  strength: number;
  monitor: boolean;
  disabledSites: string[];
}

let config: HushConfig = {
  enabled: true,
  strength: 75,
  monitor: false,
  disabledSites: [],
};

try {
  const stateStr = document.documentElement.dataset.hushState;
  if (stateStr) {
    Object.assign(config, JSON.parse(stateStr));
  }
} catch {}

document.documentElement.addEventListener("hush:state", ((e: CustomEvent) => {
  const prev = { ...config };
  Object.assign(config, e.detail);
  updateWorkletParams();
  if (typeof e.detail.monitor === "boolean" && e.detail.monitor !== prev.monitor) {
    setMonitor(e.detail.monitor);
  }
}) as EventListener);

document.documentElement.addEventListener("hush:params", ((e: CustomEvent) => {
  const msg = e.detail;
  if (typeof msg.enabled === "boolean") config.enabled = msg.enabled;
  if (typeof msg.strength === "number") config.strength = msg.strength;
  if (typeof msg.monitor === "boolean") setMonitor(msg.monitor);
  updateWorkletParams();
}) as EventListener);

// Audio pipeline
let audioContext: AudioContext | null = null;
let workletNode: AudioWorkletNode | null = null;
let currentSource: MediaStreamAudioSourceNode | null = null;
let currentDestination: MediaStreamAudioDestinationNode | null = null;
let cachedOutputStream: MediaStream | null = null;
let pipelineReady = false;
let pipelineInitializing = false;

// Monitor: mono→stereo splitter for headphone output
let monitorMerger: ChannelMergerNode | null = null;
let monitorActive = false;

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

function setMonitor(on: boolean): void {
  if (!workletNode || !audioContext) return;
  if (on && !monitorActive) {
    // Create a merger to duplicate mono (channel 0) to both L and R
    monitorMerger = audioContext.createChannelMerger(2);
    workletNode.connect(monitorMerger, 0, 0); // mono → left
    workletNode.connect(monitorMerger, 0, 1); // mono → right
    monitorMerger.connect(audioContext.destination);
    monitorActive = true;
    console.log("[HUSH] Monitor ON — both ears");
  } else if (!on && monitorActive) {
    if (monitorMerger) {
      try { workletNode.disconnect(monitorMerger); } catch {}
      try { monitorMerger.disconnect(); } catch {}
      monitorMerger = null;
    }
    monitorActive = false;
    console.log("[HUSH] Monitor OFF");
  }
}

async function initPipeline(): Promise<boolean> {
  if (pipelineReady) return true;
  if (pipelineInitializing) {
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

    // Create the output stream once — reuse across all getUserMedia calls
    cachedOutputStream = new MediaStream(currentDestination.stream.getAudioTracks());

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

// Pre-init on page load
initPipeline();

// Save real getUserMedia
const realGetUserMedia = navigator.mediaDevices.getUserMedia.bind(
  navigator.mediaDevices,
);

navigator.mediaDevices.getUserMedia = async function (
  constraints?: MediaStreamConstraints,
): Promise<MediaStream> {
  const rawStream = await realGetUserMedia(constraints);

  // If no audio requested, return raw (video-only calls etc.)
  if (!constraints?.audio) {
    return rawStream;
  }

  // If HUSH is disabled globally or for this site, return raw
  if (!config.enabled || isDisabledForSite()) {
    return rawStream;
  }

  // Ensure pipeline
  if (!pipelineReady) {
    const ready = await initPipeline();
    if (!ready) {
      return rawStream;
    }
  }

  try {
    if (audioContext!.state === "suspended") {
      await audioContext!.resume();
    }

    // Swap source (disconnect old mic, connect new one)
    if (currentSource) {
      try { currentSource.disconnect(); } catch {}
    }
    currentSource = audioContext!.createMediaStreamSource(rawStream);
    currentSource.connect(workletNode!);

    // Return stream with our processed audio + original video tracks
    // Always return the SAME audio tracks (cachedOutputStream) so apps
    // don't see track changes when switching mics
    const outputStream = new MediaStream();
    for (const track of cachedOutputStream!.getAudioTracks()) {
      outputStream.addTrack(track);
    }
    for (const track of rawStream.getVideoTracks()) {
      outputStream.addTrack(track);
    }

    document.documentElement.dispatchEvent(
      new CustomEvent("hush:status", {
        detail: { type: "status", active: true, domain: window.location.hostname },
      }),
    );

    console.log("[HUSH] Active on", window.location.hostname);
    return outputStream;
  } catch (err) {
    console.warn("[HUSH] Failed:", err);
    return rawStream;
  }
};

console.log("[HUSH] getUserMedia hijack installed");
