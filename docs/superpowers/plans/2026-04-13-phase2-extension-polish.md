# Phase 2: Extension Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the HUSH extension with auto mic selection, real latency display, floating widget, keyboard shortcut, and options page.

**Architecture:** Extends existing extension with new storage fields (preferredDeviceId), worklet latency measurement, floating widget via shadow DOM injection, and Chrome commands API for global shortcuts. All features toggle via chrome.storage and bridge the same way existing features do.

**Tech Stack:** TypeScript, React 18, Tailwind CSS 4, Chrome Extensions API (commands, storage), Shadow DOM

---

## Task 1: Auto-Select Saved Microphone

**Files:**
- Modify: `packages/extension/src/lib/storage.ts`
- Modify: `packages/extension/src/content/main-world.ts`
- Modify: `packages/extension/src/content/bridge.ts`

- [ ] **Step 1: Add preferredDeviceId to storage**

In `packages/extension/src/lib/storage.ts`, add `preferredDeviceId: string` to `HushState` interface and `preferredDeviceId: ""` to `DEFAULTS`.

- [ ] **Step 2: Update bridge to pass preferredDeviceId and monitor to main world**

In `packages/extension/src/content/bridge.ts`, update the `storage.local.get` call to include `preferredDeviceId` and `monitor` in the keys array, and include them in the `merged` object with defaults.

- [ ] **Step 3: Update main-world.ts — add preferredDeviceId to config, auto-inject into constraints, save selections**

Add `preferredDeviceId: string` to the `HushConfig` interface and default to `""`.

In the `getUserMedia` wrapper, BEFORE calling `realGetUserMedia`, if `config.preferredDeviceId` is set and the constraints don't specify a deviceId, inject it:
```typescript
if (constraints?.audio && config.preferredDeviceId) {
  const audioConstraint = constraints.audio;
  if (typeof audioConstraint === "boolean" || !audioConstraint.deviceId) {
    constraints = {
      ...constraints,
      audio: {
        ...(typeof audioConstraint === "boolean" ? {} : audioConstraint),
        deviceId: { ideal: config.preferredDeviceId },
      },
    };
  }
}
```

AFTER getting the raw stream, save the actual device ID back:
```typescript
const audioTrack = rawStream.getAudioTracks()[0];
if (audioTrack) {
  const actualDeviceId = audioTrack.getSettings().deviceId;
  if (actualDeviceId && actualDeviceId !== config.preferredDeviceId) {
    config.preferredDeviceId = actualDeviceId;
    document.documentElement.dispatchEvent(
      new CustomEvent("hush:save-device", { detail: { deviceId: actualDeviceId } }),
    );
  }
}
```

- [ ] **Step 4: Add bridge listener to save device ID**

In `packages/extension/src/content/bridge.ts`, add listener for `hush:save-device` that calls `browser.storage.local.set({ preferredDeviceId: e.detail.deviceId })`.

- [ ] **Step 5: Build, test, commit**

Build: `pnpm --filter @hush/extension build`
Commit: `feat(extension): auto-select saved microphone on page reload`

---

## Task 2: Real Latency Measurement

**Files:**
- Modify: `packages/audio-engine/src/types.ts`
- Modify: `packages/extension/src/worklet/noise-processor.ts`
- Modify: `packages/extension/src/popup/components/PowerRing.tsx`
- Modify: `packages/extension/src/popup/hooks/useHushState.ts`
- Modify: `packages/extension/src/popup/App.tsx`

- [ ] **Step 1: Add latencyMs to AudioMetrics type**

In `packages/audio-engine/src/types.ts`, add `latencyMs: number` to `AudioMetrics`.

- [ ] **Step 2: Add latency calculation to worklet metrics**

In `packages/extension/src/worklet/noise-processor.ts`, in the metrics `postMessage` block, calculate:
```typescript
const bufferDelayMs = ((this.inWrite - this.inRead) / 48000) * 1000 + (FRAME_SIZE / 48000) * 1000;
```
Add `latencyMs: Math.round(bufferDelayMs)` to the metrics message.

- [ ] **Step 3: Update popup defaults and PowerRing**

In `useHushState.ts`, add `latencyMs: 0` to `DEFAULT_METRICS`.

In `PowerRing.tsx`, change `latencyMs` prop from optional with default to required `number`. Display `{latencyMs > 0 ? latencyMs + "ms" : "—"}` instead of hardcoded `12ms`.

In `App.tsx`, pass `latencyMs={metrics.latencyMs}` to `PowerRing`.

- [ ] **Step 4: Build, test, commit**

Build: `pnpm --filter @hush/extension build`
Commit: `feat(extension): show real measured latency in popup`

---

## Task 3: Floating Widget (Shadow DOM)

**Files:**
- Create: `packages/extension/src/widget/widget-styles.ts`
- Create: `packages/extension/src/widget/floating-widget.ts`
- Modify: `packages/extension/src/content/main-world.ts`
- Modify: `packages/extension/src/content/bridge.ts`

- [ ] **Step 1: Create widget-styles.ts**

Export a `WIDGET_CSS` string constant with all widget CSS. Studio Console Noir style: `#06060a` background, cyan border, power button with glow, stats text, close button. Include `.dragging` state and `:host` reset.

- [ ] **Step 2: Create floating-widget.ts**

Export three functions:
- `createWidget(position: {x, y})` — creates `<hush-widget>` element with closed shadow DOM, inserts styled widget with power button, stats display, close button. Sets up drag handling (mousedown/mousemove/mouseup) with position save via `hush:save-state` CustomEvent. Power button dispatches `hush:widget-toggle`, close button dispatches `hush:widget-close`.
- `destroyWidget()` — removes the host element.
- `updateWidgetMetrics(reduction, latencyMs, enabled)` — updates stats text and power button state.

Use `document.createElement` for all DOM construction — no innerHTML.

- [ ] **Step 3: Integrate widget into main-world.ts**

Import `createWidget`, `destroyWidget`, `updateWidgetMetrics` from `../widget/floating-widget`.

In the `hush:state` event listener, handle `widgetPinned` changes — create or destroy widget.

In the worklet `onmessage` handler for metrics, call `updateWidgetMetrics`.

Add event listeners for `hush:widget-toggle` (toggle `config.enabled`, dispatch `hush:save-state`), `hush:widget-close` (destroy, dispatch `hush:save-state` with `widgetPinned: false`), and `hush:save-widget-pos` (dispatch `hush:save-state` with `widgetPosition`).

- [ ] **Step 4: Add bridge listener for generic state saves**

In bridge.ts, add listener for `hush:save-state` that calls `browser.storage.local.set(e.detail)`.

- [ ] **Step 5: Build, test, commit**

Build: `pnpm --filter @hush/extension build`
Commit: `feat(extension): add draggable floating widget with shadow DOM`

---

## Task 4: Keyboard Shortcut (Global Toggle)

**Files:**
- Modify: `packages/extension/src/manifest.base.json`
- Modify: `packages/extension/src/background/service-worker.ts`

- [ ] **Step 1: Update manifest commands**

Replace the `_execute_action` command with a `toggle-hush` command:
```json
"commands": {
  "toggle-hush": {
    "suggested_key": { "default": "Alt+Shift+H" },
    "description": "Toggle HUSH noise cancellation"
  }
}
```

- [ ] **Step 2: Add command listener to service worker**

In service-worker.ts, add `browser.commands.onCommand.addListener` that handles `"toggle-hush"` by reading current `enabled` state from storage, flipping it, saving, and briefly showing "ON"/"OFF" on the badge (clear after 1.5s).

- [ ] **Step 3: Build, test, commit**

Build: `pnpm --filter @hush/extension build`
Commit: `feat(extension): add Alt+Shift+H keyboard shortcut to toggle globally`

---

## Task 5: Options Page

**Files:**
- Create: `packages/extension/src/options/options.html`
- Create: `packages/extension/src/options/main.tsx`
- Create: `packages/extension/src/options/Options.tsx`
- Modify: `packages/extension/src/manifest.base.json`
- Modify: `packages/extension/src/popup/components/Header.tsx`

- [ ] **Step 1: Add options_ui to manifest**

Add `"options_ui": { "page": "src/options/options.html", "open_in_tab": true }` to manifest.base.json.

- [ ] **Step 2: Create options.html**

Standard HTML shell like popup.html but with `width: 100%` body and centered content at `max-width: 480px`. Loads `../styles/globals.css` and `./main.tsx`.

- [ ] **Step 3: Create Options component**

`Options.tsx` — React component with:
- Default strength slider (reads/writes `strength` to storage)
- Preferred microphone dropdown (enumerates devices, reads/writes `preferredDeviceId`)
- Disabled sites list with remove buttons
- Keyboard shortcut info (shows `Alt+Shift+H`, links to `chrome://extensions/shortcuts`)
- "Saved" toast notification on changes

Uses `getState`/`setState` from storage.ts. Uses `navigator.mediaDevices.enumerateDevices()` for mic list. All DOM constructed via React — no innerHTML.

- [ ] **Step 4: Link settings button in popup Header**

In `Header.tsx`, make the ⚙ button call `chrome.runtime.openOptionsPage()` on click.

- [ ] **Step 5: Build, test, commit**

Build: `pnpm --filter @hush/extension build`
Commit: `feat(extension): add options page with strength, mic, and shortcut settings`

---

## Task 6: Final Build + Push + Zip

- [ ] **Step 1: Run all tests**

`pnpm test`

- [ ] **Step 2: Build**

`pnpm --filter @hush/extension build`

- [ ] **Step 3: Push and zip**

```bash
git push origin main
cd packages/extension/dist && rm -f ../../hush-chrome-v0.2.0.zip && zip -r ../../hush-chrome-v0.2.0.zip chrome/
```
