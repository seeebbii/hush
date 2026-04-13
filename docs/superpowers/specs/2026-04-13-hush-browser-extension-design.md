# HUSH Browser Extension — Design Spec

## Overview

HUSH is a cross-browser extension that provides real-time AI-powered noise cancellation for any website that uses a microphone. It intercepts `getUserMedia` calls transparently, processes audio through RNNoise WASM in an AudioWorklet, and returns a clean stream to the page. Paired with a marketing site + live demo.

**Primary use case:** Noise cancellation for Work Adventure, Google Meet, and any browser-based voice app — without installing a desktop tool or configuring virtual audio devices.

---

## Architecture

### Delivery Model

Three packages in a pnpm + Turborepo monorepo:

| Package | Purpose |
|---------|---------|
| `packages/extension/` | Cross-browser extension (Chrome, Firefox, Edge, Safari) |
| `packages/web/` | Marketing landing page + live demo |
| `packages/audio-engine/` | Shared AudioWorklet + RNNoise WASM (used by both extension and demo) |

The audio engine code is identical between extension and demo. The only difference is how the mic stream is acquired — the extension hijacks `getUserMedia`, the demo calls it directly.

### getUserMedia Hijack (Core Mechanism)

**Step 1 — Injection:** Content script runs at `document_start` (before any page JavaScript). It saves a reference to the real `navigator.mediaDevices.getUserMedia`, then replaces it with a wrapper function.

**Step 2 — Interception:** When a page (e.g., Work Adventure, Google Meet) calls `getUserMedia({audio: true})`, our wrapper intercepts. It calls the real `getUserMedia` to get the raw mic stream, then checks if HUSH is enabled for this site.

**Step 3 — Processing:** If enabled, the raw MediaStream is routed through a Web Audio graph:
```
Raw MediaStream
  → createMediaStreamSource()
  → AudioWorkletNode (noise-processor)
      └─ RNNoise WASM (480-sample frames)
      └─ Noise gate
  → createMediaStreamDestination()
  → Clean MediaStream
```

**Step 4 — Return:** The wrapper resolves with the clean MediaStream. Video tracks from the original stream are passed through untouched. The page's WebRTC connection uses the clean stream as if it were the native mic.

If HUSH is disabled (globally or for the current site), the wrapper passes through the raw stream unchanged.

### Audio Processing Pipeline (Inside AudioWorklet)

Each `process()` call receives 128 samples from the Web Audio API. RNNoise requires 480 samples per frame (10ms at 48kHz). The worklet buffers samples in a ring buffer and processes when 480 have accumulated:

```
128 samples in → Ring Buffer → 480 accumulated? → RNNoise denoise → Noise Gate → output
```

**WASM loading sequence:**
1. Extension bundles RNNoise WASM built with Emscripten (`SINGLE_FILE=1`, `WASM_ASYNC_COMPILATION=0`)
2. On first mic request, main thread compiles the WASM module via `WebAssembly.compile()`
3. Compiled module transferred to AudioWorklet via `port.postMessage()`
4. Worklet instantiates synchronously in constructor — starts in pass-through until ready

**Latency budget:**

| Stage | Latency |
|-------|---------|
| AudioWorklet quanta | ~3ms |
| 128→480 buffering | ~10ms |
| RNNoise inference | <1ms |
| Noise gate | <1ms |
| **Total** | **~15ms** |

Well within the 40ms budget. Imperceptible in calls.

**Memory rules:**
- Never allocate inside `process()` — GC pauses break real-time audio
- Pre-allocate all Float32Array buffers in the worklet constructor
- Use HeapAudioBuffer pattern for WASM ↔ JS memory copies

### Site Scope

Universal by default — HUSH processes audio on every site that requests mic access. Users can disable per-site via the popup toggle. No manual URL management.

---

## Extension UI

### Popup (Primary Control Surface)

Minimal "Studio Console Noir" design. Width: 320px. Contains:

1. **Header** — HUSH logo, pin-to-page button, settings button
2. **Power section** — Large power ring with animated cyan glow when active. Shows status (Active/Disabled), latency, and sample rate
3. **Strength slider** — 0-100%, controls the wet/dry mix ratio (0% = raw audio, 100% = fully processed). RNNoise always runs at full suppression; the slider crossfades between raw and denoised signals. This avoids artifacts from partial RNNoise application. Gradient fill (cyan → violet)
4. **Level meters** — Three horizontal bars:
   - Input level (dBFS)
   - Output level (dBFS)
   - Noise removed (dB)
5. **Site toggle** — Shows current domain favicon + hostname, with on/off toggle
6. **Footer** — A/B Compare link (Phase 2), Options link, version

**Keyboard shortcut:** `Alt+Shift+H` toggles HUSH on/off globally without opening the popup.

### Floating Widget (Pin to Page)

When the user clicks the pin button in the popup, a compact widget is injected into the current page:

- Compact pill shape: power ring + "HUSH" label + noise reduction stat + latency + close button
- Injected via Shadow DOM — fully isolated from page styles
- Draggable to any screen position, position persisted across page loads
- Click power ring to toggle, ✕ to unpin
- Does not interfere with page content or event handlers

### Toolbar Icon States

| State | Appearance | Meaning |
|-------|-----------|---------|
| Active | Full color gradient (cyan→violet) | Processing audio |
| Idle | Slightly dimmed gradient | Enabled, no mic active |
| Disabled | Grey | Turned off globally |
| Site off | Grey with red border | Disabled for current domain |

---

## Cross-Browser Compatibility

### Manifest V3 (Single Codebase)

One codebase with per-browser build targets. All audio processing code is identical — only the manifest and API shims differ.

| Browser | Support Level | Notes |
|---------|-------------|-------|
| Chrome / Edge / Brave | Full | Manifest V3 native. AudioWorklet + WASM + SharedArrayBuffer all supported |
| Firefox | Full (minor shims) | MV3 since FF109. `Atomics.wait` disabled in AudioWorklet — use `Atomics.waitAsync`. `browser.*` API namespace |
| Safari | Supported (caveats) | Web Extension API (Safari 14+). Requires Xcode wrapper project. AudioContext needs user gesture to resume. Latency quirks |

### Browser API Compatibility Layer

Use `webextension-polyfill` (Mozilla's package) as the base — wraps Chrome's callback APIs into promise-based `browser.*` namespace. Add a thin custom shim for:
- `chrome.storage` ↔ `browser.storage`
- `chrome.runtime` ↔ `browser.runtime`
- `Atomics.wait` → `Atomics.waitAsync` (Firefox AudioWorklet)

### Build Targets

```
packages/extension/build/
├── chrome/       # Chrome Web Store
├── firefox/      # Firefox Add-ons
├── edge/         # Edge Add-ons (same as Chrome with minor manifest tweaks)
└── safari/       # Xcode wrapper project
```

---

## State Management

### Persisted State

Stored in `chrome.storage.local` / `browser.storage.local`:

| Key | Type | Description |
|-----|------|-------------|
| `enabled` | boolean | Global on/off toggle |
| `strength` | number (0-100) | Noise cancellation strength |
| `disabledSites` | string[] | Domains where HUSH is disabled |
| `widgetPinned` | boolean | Whether floating widget is shown |
| `widgetPosition` | {x, y} | Last drag position of widget |

### Message Flow

```
Popup ──(toggle/strength)──→ Background Service Worker
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
              Content Script  Content Script  Content Script
              (Tab 1)         (Tab 2)         (Tab 3)
                    │
                    ▼
              AudioWorklet (parameters via port.postMessage)
                    │
                    ▼ (levels + metrics back via port.postMessage)
              Content Script → Popup (if open)
```

Background service worker acts as the central state coordinator:
- Receives state changes from popup
- Broadcasts to all content scripts via `runtime.sendMessage`
- Updates toolbar icon badge based on state
- Persists to storage

---

## Marketing Site + Live Demo (`packages/web/`)

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18+ with TypeScript (strict) |
| Build | Vite 5+ with `vite-plugin-wasm` + `vite-plugin-top-level-await` |
| Styling | Tailwind CSS 4 via `@tailwindcss/vite` |
| Animations | Framer Motion |

### Landing Page

"Studio Console Noir" aesthetic. Sections:
1. **Hero** — Animated canvas waveform (noisy → clean morph), headline "Your voice. Nothing else.", CTAs for "Try Demo" and "Install Extension"
2. **How It Works** — Animated pipeline diagram with flowing particles
3. **Noise Types** — Cards for keyboard, fan, traffic, etc. with waveform textures
4. **Install** — Browser-specific install buttons (detects current browser)
5. **Footer** — GitHub, docs, privacy

### Live Demo Page

Same AudioWorklet + RNNoise WASM engine as the extension, but called directly (no getUserMedia hijack). User grants mic, hears noise cancellation in real-time with:
- Power toggle
- Strength slider
- Level meters (input/output/reduction)
- A/B compare

Purpose: Let visitors experience HUSH before installing the extension.

---

## Monorepo Structure

```
hush/
├── CLAUDE.md
├── HUSH-project-spec.md
├── pnpm-workspace.yaml
├── turbo.json
├── package.json
│
├── packages/
│   ├── extension/                # Browser extension
│   │   ├── manifest.json         # Manifest V3 (Chrome base)
│   │   ├── manifest.firefox.json # Firefox overrides
│   │   ├── src/
│   │   │   ├── content/
│   │   │   │   ├── hijack.ts         # getUserMedia wrapper
│   │   │   │   ├── audio-pipeline.ts # Web Audio graph setup
│   │   │   │   └── inject.ts         # Entry point (document_start)
│   │   │   ├── background/
│   │   │   │   └── service-worker.ts # State coordinator, badge updates
│   │   │   ├── popup/
│   │   │   │   ├── App.tsx           # React popup UI
│   │   │   │   ├── components/       # PowerRing, Slider, Meter, SiteToggle
│   │   │   │   └── main.tsx
│   │   │   ├── widget/
│   │   │   │   ├── floating.ts       # Shadow DOM widget injector
│   │   │   │   └── widget.css
│   │   │   └── lib/
│   │   │       ├── browser-polyfill.ts  # Cross-browser API shim
│   │   │       ├── storage.ts           # Typed storage wrapper
│   │   │       └── messages.ts          # Typed message protocol
│   │   ├── build/                    # Per-browser output
│   │   └── vite.config.ts
│   │
│   ├── web/                          # Marketing + demo site
│   │   ├── vite.config.ts
│   │   └── src/
│   │       ├── pages/
│   │       │   ├── Landing.tsx
│   │       │   └── Demo.tsx
│   │       ├── components/
│   │       │   ├── landing/          # Hero, Pipeline, NoiseCards
│   │       │   ├── demo/             # DemoPlayer, controls
│   │       │   └── ui/               # Button, Toggle, Slider
│   │       └── styles/
│   │           ├── globals.css
│   │           └── tokens.css
│   │
│   ├── audio-engine/                 # Shared audio processing
│   │   ├── worklet/
│   │   │   └── noise-processor.ts    # AudioWorkletProcessor
│   │   ├── wasm/
│   │   │   ├── rnnoise.wasm          # Emscripten-built binary
│   │   │   └── rnnoise-loader.ts     # Compile + transfer to worklet
│   │   └── lib/
│   │       ├── noise-gate.ts         # Soft-knee gate
│   │       ├── frame-buffer.ts       # 128→480 ring buffer
│   │       ├── metering.ts           # RMS, dBFS, peak hold
│   │       └── types.ts              # Shared audio types
│   │
│   └── engine/                       # Rust engine (Phase 3+, desktop)
│       ├── Cargo.toml
│       └── src/
│
├── scripts/
│   ├── build-extension.sh            # Per-browser builds
│   └── dev.sh
│
└── docs/
```

---

## Implementation Phases (Updated)

### Phase 1 — Extension MVP
1. Set up monorepo (pnpm workspaces + Turborepo)
2. Build `audio-engine` package: AudioWorklet processor with frame buffering + noise gate (TypeScript)
3. Integrate `@shiguredo/rnnoise-wasm` into worklet
4. Build extension `content/` scripts: getUserMedia hijack + Web Audio graph
5. Build extension `background/` service worker: state management, badge updates
6. Build extension `popup/`: power toggle, strength slider, level meters, site toggle
7. Cross-browser build pipeline (Chrome + Firefox)
8. Test on Work Adventure + Google Meet

### Phase 2 — Extension Polish
- Floating widget (pin to page, shadow DOM, draggable)
- A/B comparison (bypass toggle)
- Keyboard shortcut (Alt+Shift+H)
- Options page (default strength, keyboard shortcut config)
- Edge + Safari builds
- Chrome Web Store + Firefox Add-ons submission

### Phase 3 — Marketing Site + Demo
- Landing page with animated hero (Canvas waveform morph)
- "How it works" pipeline animation
- Noise type cards
- Live demo page (same audio engine, direct mic access)
- Browser-detect install buttons
- Deploy to Vercel/Cloudflare Pages

### Phase 4 — Rust Engine + Desktop (Future)
- Rust crate with `nnnoiseless` + `rustfft`
- Port DSP pipeline to Rust
- WASM target to replace TypeScript worklet
- Tauri 2.0 desktop app with virtual audio device

---

## Performance Targets

| Metric | Target | How to Measure |
|--------|--------|---------------|
| End-to-end latency | < 40ms | Round-trip audio measurement |
| CPU per tab | < 5% | `performance.now()` in worklet |
| Memory per tab | < 30MB | Chrome DevTools |
| WASM binary size | < 6MB (inline base64) | Build output |
| Extension package | < 8MB | Packaged .zip |
| Noise reduction | > 20dB | A/B with pink noise |
| Popup render | < 100ms | First meaningful paint |

---

## Design Tokens

"Studio Console Noir" — dark, precise, professional audio aesthetic.

```css
/* Backgrounds */
--bg-primary:     #06060a;
--bg-secondary:   #0c0c12;
--bg-tertiary:    #12121c;
--bg-hover:       #1a1a28;

/* Accents */
--accent-cyan:    #00f0ff;
--accent-magenta: #ff3d71;
--accent-green:   #00ff88;
--accent-amber:   #ffaa00;
--accent-violet:  #a855f7;

/* Typography */
--font-display: 'Instrument Sans', sans-serif;
--font-mono:    'JetBrains Mono', monospace;
--font-body:    'Plus Jakarta Sans', sans-serif;
```

---

## Known Gotchas

1. **Content script timing:** Must run at `document_start` to wrap `getUserMedia` before page scripts execute. Use `"run_at": "document_start"` in manifest.
2. **128→480 buffering:** AudioWorklet delivers 128 samples per process() call. RNNoise needs 480. Buffer and batch — adds ~10ms latency.
3. **RNNoise WASM size:** ~5.5MB with smaller model. Built with `SINGLE_FILE=1` to inline as base64 for AudioWorklet compatibility.
4. **Firefox Atomics.wait:** Disabled in AudioWorklet scope. Use `Atomics.waitAsync` or `Atomics.notify`.
5. **Safari AudioContext:** Requires user gesture to `resume()`. Handle suspended state gracefully.
6. **Shadow DOM for widget:** Must use closed shadow DOM to prevent page CSS from affecting the widget.
7. **Multiple getUserMedia calls:** Some apps call getUserMedia multiple times (e.g., device switch). Each call must be intercepted and wrapped.
8. **Video tracks:** getUserMedia may request both audio and video. Only process audio tracks — pass video through untouched.
9. **AudioContext per tab:** Each tab with active processing gets its own AudioContext + WASM instance. Cannot share across tabs due to browser security model.
10. **Manifest V3 service worker:** Background script is a service worker that can be terminated. Use `chrome.storage` for persistence, not in-memory state.
