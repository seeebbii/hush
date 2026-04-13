import { useEffect, useRef, useState } from "react";
import { getState, setState } from "../lib/storage";

interface MicDevice {
  deviceId: string;
  label: string;
}

export function Options() {
  const [strength, setStrengthState] = useState(75);
  const [preferredDeviceId, setPreferredDeviceIdState] = useState("");
  const [disabledSites, setDisabledSitesState] = useState<string[]>([]);
  const [devices, setDevices] = useState<MicDevice[]>([]);
  const [showToast, setShowToast] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getState().then((s) => {
      setStrengthState(s.strength);
      setPreferredDeviceIdState(s.preferredDeviceId);
      setDisabledSitesState(s.disabledSites);
    });

    navigator.mediaDevices
      .enumerateDevices()
      .then((all) =>
        all
          .filter((d) => d.kind === "audioinput")
          .map((d, i) => ({
            deviceId: d.deviceId,
            label: d.label || `Microphone ${i + 1}`,
          })),
      )
      .then(setDevices)
      .catch(() => {});
  }, []);

  function triggerToast() {
    setShowToast(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setShowToast(false), 1500);
  }

  function handleStrengthChange(value: number) {
    setStrengthState(value);
    setState({ strength: value });
    triggerToast();
  }

  function handleDeviceChange(deviceId: string) {
    setPreferredDeviceIdState(deviceId);
    setState({ preferredDeviceId: deviceId });
    triggerToast();
  }

  function handleRemoveSite(site: string) {
    const next = disabledSites.filter((s) => s !== site);
    setDisabledSitesState(next);
    setState({ disabledSites: next });
    triggerToast();
  }

  return (
    <div
      style={{ fontFamily: "var(--font-body)" }}
      className="text-text-primary"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent-cyan to-accent-violet flex items-center justify-center font-bold text-sm text-bg-primary font-[family-name:var(--font-display)]">
          H
        </div>
        <div>
          <h1 className="font-[family-name:var(--font-display)] font-bold text-xl tracking-[2px] text-text-primary leading-none">
            Must Hush Settings
          </h1>
          <span className="font-[family-name:var(--font-mono)] text-[10px] text-text-tertiary">
            v0.1.0
          </span>
        </div>
      </div>

      {/* Default Strength */}
      <section className="mb-5">
        <p className="font-[family-name:var(--font-mono)] text-[10px] text-text-tertiary uppercase tracking-[2px] mb-2">
          Default Strength
        </p>
        <div className="bg-bg-secondary rounded-lg px-3 py-3 border border-border-subtle">
          <div className="flex items-center justify-between mb-2">
            <span className="font-[family-name:var(--font-mono)] text-xs text-text-secondary">
              Noise Reduction
            </span>
            <span className="font-[family-name:var(--font-mono)] text-sm text-accent-cyan">
              {strength}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={strength}
            onChange={(e) => handleStrengthChange(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[#00f0ff]"
            style={{
              background: `linear-gradient(to right, #00f0ff ${strength}%, rgba(255,255,255,0.08) ${strength}%)`,
            }}
          />
          <div className="flex justify-between mt-1">
            <span className="font-[family-name:var(--font-mono)] text-[9px] text-text-tertiary">
              0%
            </span>
            <span className="font-[family-name:var(--font-mono)] text-[9px] text-text-tertiary">
              100%
            </span>
          </div>
        </div>
      </section>

      {/* Preferred Microphone */}
      <section className="mb-5">
        <p className="font-[family-name:var(--font-mono)] text-[10px] text-text-tertiary uppercase tracking-[2px] mb-2">
          Preferred Microphone
        </p>
        <div className="bg-bg-secondary rounded-lg px-3 py-3 border border-border-subtle">
          <select
            value={preferredDeviceId}
            onChange={(e) => handleDeviceChange(e.target.value)}
            className="w-full bg-bg-secondary border border-border-default rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent-cyan"
          >
            <option value="">System Default</option>
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
          <p className="font-[family-name:var(--font-mono)] text-[10px] text-text-tertiary mt-2">
            Grant microphone permission to see available devices.
          </p>
        </div>
      </section>

      {/* Disabled Sites */}
      <section className="mb-5">
        <p className="font-[family-name:var(--font-mono)] text-[10px] text-text-tertiary uppercase tracking-[2px] mb-2">
          Disabled Sites
        </p>
        <div className="bg-bg-secondary rounded-lg px-3 py-3 border border-border-subtle">
          {disabledSites.length === 0 ? (
            <p className="font-[family-name:var(--font-mono)] text-xs text-text-tertiary text-center py-1">
              No sites disabled
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {disabledSites.map((site) => (
                <li
                  key={site}
                  className="flex items-center justify-between py-1.5 px-2 rounded-md bg-bg-tertiary border border-border-subtle"
                >
                  <span className="font-[family-name:var(--font-mono)] text-xs text-text-secondary">
                    {site}
                  </span>
                  <button
                    onClick={() => handleRemoveSite(site)}
                    className="font-[family-name:var(--font-mono)] text-[10px] text-accent-magenta hover:text-accent-magenta/80 transition-colors px-2 py-0.5 rounded border border-accent-magenta/20 hover:border-accent-magenta/40"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Keyboard Shortcut */}
      <section className="mb-5">
        <p className="font-[family-name:var(--font-mono)] text-[10px] text-text-tertiary uppercase tracking-[2px] mb-2">
          Keyboard Shortcut
        </p>
        <div className="bg-bg-secondary rounded-lg px-3 py-3 border border-border-subtle">
          <div className="flex items-center justify-between mb-2">
            <span className="font-[family-name:var(--font-mono)] text-xs text-text-secondary">
              Toggle noise suppression
            </span>
          </div>
          <div className="flex flex-col gap-1.5 mb-2">
            <div className="flex items-center justify-between">
              <span className="font-[family-name:var(--font-mono)] text-[10px] text-text-tertiary">Windows / Linux</span>
              <div className="flex items-center gap-1">
                {["Alt", "Shift", "H"].map((key) => (
                  <kbd key={key} className="font-[family-name:var(--font-mono)] text-[10px] text-accent-cyan bg-bg-tertiary border border-border-active rounded px-1.5 py-0.5">{key}</kbd>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-[family-name:var(--font-mono)] text-[10px] text-text-tertiary">macOS</span>
              <div className="flex items-center gap-1">
                {["Ctrl", "Shift", "H"].map((key) => (
                  <kbd key={key} className="font-[family-name:var(--font-mono)] text-[10px] text-accent-cyan bg-bg-tertiary border border-border-active rounded px-1.5 py-0.5">{key}</kbd>
                ))}
              </div>
            </div>
          </div>
          <p className="font-[family-name:var(--font-mono)] text-[10px] text-text-tertiary">
            To customize,{" "}
            <a
              href="chrome://extensions/shortcuts"
              target="_blank"
              rel="noreferrer"
              className="text-accent-cyan hover:underline"
            >
              open extension shortcuts
            </a>{" "}
            in your browser.
          </p>
        </div>
      </section>

      {/* Saved Toast */}
      {showToast && (
        <div className="fixed bottom-6 right-6 flex items-center gap-2 bg-bg-secondary border border-accent-green/30 rounded-lg px-4 py-2.5 shadow-lg">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-green" />
          <span className="font-[family-name:var(--font-mono)] text-xs text-accent-green">
            Saved
          </span>
        </div>
      )}
    </div>
  );
}
