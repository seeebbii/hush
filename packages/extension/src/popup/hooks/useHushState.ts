import { useEffect, useState, useCallback } from "react";
import { browser } from "../../lib/browser-polyfill";
import type { HushState } from "../../lib/storage";
import { getState, setState } from "../../lib/storage";
import type { AudioMetrics } from "@hush/audio-engine";

const DEFAULT_METRICS: AudioMetrics = {
  inputLevel: -96,
  outputLevel: -96,
  reduction: 0,
  vadProbability: 0,
  latencyMs: 0,
};

export function useHushState() {
  const [state, setLocalState] = useState<HushState>({
    enabled: true,
    strength: 75,
    disabledSites: [],
    widgetPinned: false,
    widgetPosition: { x: 20, y: 20 },
  });

  const [metrics, setMetrics] = useState<AudioMetrics>(DEFAULT_METRICS);
  const [currentDomain, setCurrentDomain] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    getState().then(setLocalState);
    browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (tabs[0]?.url) {
        try {
          setCurrentDomain(new URL(tabs[0].url).hostname);
        } catch {}
      }
    });
  }, []);

  useEffect(() => {
    const listener = (msg: unknown) => {
      const message = msg as { type: string; metrics?: AudioMetrics; active?: boolean };
      if (message.type === "metrics" && message.metrics) {
        setMetrics(message.metrics);
        setIsProcessing(true);
      }
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);

  useEffect(() => {
    const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== "local") return;
      setLocalState((prev) => {
        const next = { ...prev };
        for (const [key, change] of Object.entries(changes)) {
          if (key in next && change.newValue !== undefined) {
            (next as Record<string, unknown>)[key] = change.newValue;
          }
        }
        return next;
      });
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, []);

  const setEnabled = useCallback((enabled: boolean) => {
    setState({ enabled });
  }, []);

  const setStrength = useCallback((strength: number) => {
    setState({ strength });
  }, []);

  const toggleMonitor = useCallback(() => {
    setState({ monitor: !state.monitor });
  }, [state.monitor]);

  const toggleSite = useCallback(() => {
    if (!currentDomain) return;
    const disabled = state.disabledSites.includes(currentDomain);
    const disabledSites = disabled
      ? state.disabledSites.filter((s) => s !== currentDomain)
      : [...state.disabledSites, currentDomain];
    setState({ disabledSites });
  }, [currentDomain, state.disabledSites]);

  const isSiteDisabled = currentDomain
    ? state.disabledSites.includes(currentDomain)
    : false;

  return {
    ...state,
    metrics,
    currentDomain,
    isProcessing,
    isSiteDisabled,
    setEnabled,
    setStrength,
    toggleSite,
    toggleMonitor,
  };
}
