import { browser } from "../lib/browser-polyfill";
import type { HushState } from "../lib/storage";

const activeTabs = new Map<number, string>();

browser.runtime.onMessage.addListener((msg: unknown, sender) => {
  const message = msg as { type: string; [key: string]: unknown };

  switch (message.type) {
    case "status": {
      const tabId = sender.tab?.id;
      if (tabId != null) {
        if (message.active) {
          activeTabs.set(tabId, message.domain as string);
        } else {
          activeTabs.delete(tabId);
        }
        updateBadge(tabId);
      }
      break;
    }

    case "metrics": {
      // Forward metrics from content script to popup (if open)
      break;
    }

    case "get-status": {
      const tabId = sender.tab?.id;
      return Promise.resolve({
        active: tabId != null && activeTabs.has(tabId),
        domain: tabId != null ? activeTabs.get(tabId) : null,
      });
    }
  }
});

browser.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;

  const state = await browser.storage.local.get({
    enabled: true,
    strength: 75,
  }) as Pick<HushState, "enabled" | "strength">;

  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    if (tab.id != null) {
      browser.tabs.sendMessage(tab.id, {
        type: "params-changed",
        enabled: state.enabled,
        strength: state.strength,
      }).catch(() => {});
    }
  }

  const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (activeTab?.id != null) {
    updateBadge(activeTab.id);
  }
});

async function updateBadge(tabId: number): Promise<void> {
  const state = await browser.storage.local.get({ enabled: true, disabledSites: [] }) as Pick<HushState, "enabled" | "disabledSites">;

  const isActive = activeTabs.has(tabId);
  const domain = activeTabs.get(tabId);
  const isSiteDisabled = domain != null && state.disabledSites.includes(domain);

  let color: string;
  let text: string;

  if (!state.enabled) {
    color = "#666666";
    text = "";
  } else if (isSiteDisabled) {
    color = "#ff3d71";
    text = "OFF";
  } else if (isActive) {
    color = "#00ff88";
    text = "ON";
  } else {
    color = "#00f0ff";
    text = "";
  }

  await browser.action.setBadgeBackgroundColor({ color, tabId });
  await browser.action.setBadgeText({ text, tabId });
}

browser.tabs.onRemoved.addListener((tabId) => {
  activeTabs.delete(tabId);
});
