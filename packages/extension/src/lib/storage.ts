import { browser } from "./browser-polyfill";

export interface HushState {
  enabled: boolean;
  strength: number;
  monitor: boolean;
  disabledSites: string[];
  widgetPinned: boolean;
  widgetPosition: { x: number; y: number };
}

const DEFAULTS: HushState = {
  enabled: true,
  strength: 75,
  monitor: false,
  disabledSites: [],
  widgetPinned: false,
  widgetPosition: { x: 20, y: 20 },
};

export async function getState(): Promise<HushState> {
  const stored = await browser.storage.local.get(
    Object.keys(DEFAULTS) as string[],
  );
  return { ...DEFAULTS, ...(stored as unknown as Partial<HushState>) };
}

export async function setState(partial: Partial<HushState>): Promise<void> {
  await browser.storage.local.set(partial);
}

export function onStateChange(
  callback: (changes: Partial<HushState>) => void,
): void {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const parsed: Partial<HushState> = {};
    for (const [key, change] of Object.entries(changes)) {
      if (key in DEFAULTS) {
        (parsed as Record<string, unknown>)[key] = change.newValue;
      }
    }
    if (Object.keys(parsed).length > 0) {
      callback(parsed);
    }
  });
}
