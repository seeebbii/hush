// Bridge script — runs in ISOLATED world (has extension API access)
// Communicates with main-world.ts via CustomEvents on document.documentElement
import { browser } from "../lib/browser-polyfill";

// Pass extension URLs to main world via DOM dataset (synchronous, available immediately)
document.documentElement.dataset.hushWorkletUrl = browser.runtime.getURL(
  "src/worklet/noise-processor.js",
);

// Load initial state and pass to main world
browser.storage.local
  .get(["enabled", "strength", "disabledSites", "monitor", "preferredDeviceId"])
  .then((state) => {
    const merged = {
      enabled: state.enabled ?? true,
      strength: state.strength ?? 75,
      disabledSites: state.disabledSites ?? [],
      monitor: state.monitor ?? false,
      preferredDeviceId: state.preferredDeviceId ?? "",
    };
    document.documentElement.dataset.hushState = JSON.stringify(merged);
    // Also dispatch event in case main-world script already loaded
    document.documentElement.dispatchEvent(
      new CustomEvent("hush:state", { detail: merged }),
    );
  });

// Listen for metrics from main world → forward to background/popup
document.documentElement.addEventListener("hush:metrics", ((e: CustomEvent) => {
  browser.runtime
    .sendMessage({ type: "metrics", metrics: e.detail })
    .catch(() => {});
}) as EventListener);

// Listen for status from main world → forward to background
document.documentElement.addEventListener("hush:status", ((e: CustomEvent) => {
  browser.runtime.sendMessage(e.detail).catch(() => {});
}) as EventListener);

// Listen for params changes from background → forward to main world
browser.runtime.onMessage.addListener((msg: unknown) => {
  const message = msg as { type: string };
  if (message.type === "params-changed") {
    document.documentElement.dispatchEvent(
      new CustomEvent("hush:params", { detail: msg }),
    );
  }
});

// Listen for storage changes → forward to main world
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const update: Record<string, unknown> = {};
  for (const [key, change] of Object.entries(changes)) {
    if (change.newValue !== undefined) {
      update[key] = change.newValue;
    }
  }
  if (Object.keys(update).length > 0) {
    document.documentElement.dispatchEvent(
      new CustomEvent("hush:state", { detail: update }),
    );
  }
});

// Listen for device save requests from main world → persist to storage
document.documentElement.addEventListener("hush:save-device", ((e: CustomEvent) => {
  browser.storage.local.set({ preferredDeviceId: e.detail.deviceId });
}) as EventListener);
