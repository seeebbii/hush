import { browser } from "./browser-polyfill";
import type { AudioMetrics } from "@hush/audio-engine";

// Messages sent from popup/background to content scripts
export type ControlMessage =
  | { type: "get-status" }
  | { type: "params-changed"; enabled: boolean; strength: number }
  | { type: "toggle-widget"; pinned: boolean };

// Messages sent from content scripts to popup/background
export type StatusMessage =
  | { type: "status"; active: boolean; domain: string }
  | { type: "metrics"; metrics: AudioMetrics };

export async function sendToActiveTab(msg: ControlMessage): Promise<void> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0]?.id;
  if (tabId != null) {
    browser.tabs.sendMessage(tabId, msg).catch(() => {
      // Tab might not have content script (e.g., chrome:// pages)
    });
  }
}

export async function sendToAllTabs(msg: ControlMessage): Promise<void> {
  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    if (tab.id != null) {
      browser.tabs.sendMessage(tab.id, msg).catch(() => {});
    }
  }
}

export function onMessage(
  handler: (msg: ControlMessage | StatusMessage) => void,
): void {
  browser.runtime.onMessage.addListener((msg: unknown) => {
    handler(msg as ControlMessage | StatusMessage);
  });
}
