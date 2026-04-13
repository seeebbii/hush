# HUSH — Real-Time Noise Cancellation Platform

## Project Overview

HUSH is an open-source, privacy-first noise cancellation platform with three delivery modes:
1. **Browser Extension** (primary) — Cross-browser extension that intercepts `getUserMedia` to transparently denoise mic audio on any website (Work Adventure, Google Meet, etc.)
2. **Marketing Site + Live Demo** — Landing page with a "try it now" demo that runs the same audio engine directly
3. **Desktop App** (future) — Tauri 2.0 shell with native Rust audio engine + virtual audio device

All audio processing is local. Zero data leaves the device.

Reference spec: `HUSH-project-spec.md`
Design spec: `docs/superpowers/specs/2026-04-13-hush-browser-extension-design.md`

---

## Architecture Decisions

### Extension-First Approach
The original spec described a standalone web page + desktop app. We pivoted to a **browser extension** because:
- A standalone web page cannot route processed audio to another tab's WebRTC connection
- The user's primary use case is noise cancellation in Work Adventure and Google Meet
- An extension intercepts `getUserMedia` transparently — pages never know their audio is being processed
- No virtual audio device drivers or desktop installs needed

### getUserMedia Hijack
The extension uses a content script injected at `document_start` to wrap `navigator.mediaDevices.getUserMedia`. When any page requests mic access:
1. Our wrapper calls the real `getUserMedia` to get the raw stream
2. Routes it through AudioWorklet (RNNoise WASM + noise gate)
3. Returns the clean MediaStream to the page
4. Page's WebRTC/recording works normally with the clean stream

### RNNoise Strategy
- **Browser (extension + demo):** `@shiguredo/rnnoise-wasm` (Emscripten-compiled C→WASM, v2025.1.x). Built with `SINGLE_FILE=1` + `WASM_ASYNC_COMPILATION=0` for AudioWorklet compatibility
- **Desktop (future):** `nnnoiseless` crate (pure Rust port of RNNoise)

> **Why not wasm-bindgen in AudioWorklet?** `wasm-bindgen` uses `TextDecoder`/`TextEncoder` which are NOT available in `AudioWorkletGlobalScope`. Open issue `wasm-bindgen#2367`. Emscripten-compiled RNNoise is battle-tested (Jitsi uses it in production).

### Shared Audio Engine
The `audio-engine` package contains all AudioWorklet + WASM code. Used identically by both the extension and the live demo page. The only difference is how the mic stream is acquired (hijack vs. direct getUserMedia call).

### Cross-Browser via WebExtensions API
Single codebase using Manifest V3 + `webextension-polyfill` (Mozilla). Per-browser build targets with minimal differences.

---

## Tech Stack

### Browser Extension (`packages/extension/`)
| Layer | Technology |
|-------|-----------|
| API | WebExtensions Manifest V3 |
| Popup UI | React 18+ with TypeScript (strict) |
| Build | Vite 5+ |
| Styling | Tailwind CSS 4 via `@tailwindcss/vite` |
| State | `chrome.storage.local` / `browser.storage.local` |
| Cross-browser | `webextension-polyfill` + custom shims |
| Targets | Chrome, Firefox, Edge, Safari |

### Marketing Site + Demo (`packages/web/`)
| Layer | Technology |
|-------|-----------|
| Framework | React 18+ with TypeScript (strict) |
| Build | Vite 5+ with `vite-plugin-wasm` + `vite-plugin-top-level-await` |
| Styling | Tailwind CSS 4 via `@tailwindcss/vite` |
| Animations | Framer Motion |

### Shared Audio Engine (`packages/audio-engine/`)
| Layer | Technology |
|-------|-----------|
| Processing | AudioWorklet + RNNoise WASM |
| ML Denoiser | `@shiguredo/rnnoise-wasm` (Emscripten) |
| DSP | TypeScript (noise gate, frame buffer, metering) |

### Monorepo
| Tool | Purpose |
|------|---------|
| pnpm | Package manager + workspaces |
| Turborepo | Task orchestration, caching, parallel builds |

### Desktop App — Future (`packages/desktop/`)
| Layer | Technology |
|-------|-----------|
| App Shell | Tauri 2.0 |
| Audio Engine | Rust (cpal 0.17+, rustfft 6.2, nnnoiseless 0.3) |

---

## Project Structure

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
│   │   ├── vite.config.ts
│   │   ├── src/
│   │   │   ├── content/
│   │   │   │   ├── inject.ts         # Entry point (document_start)
│   │   │   │   ├── hijack.ts         # getUserMedia wrapper
│   │   │   │   └── audio-pipeline.ts # Web Audio graph setup
│   │   │   ├── background/
│   │   │   │   └── service-worker.ts # State coordinator, badge updates
│   │   │   ├── popup/
│   │   │   │   ├── main.tsx
│   │   │   │   ├── App.tsx
│   │   │   │   └── components/       # PowerRing, Slider, Meter, SiteToggle
│   │   │   ├── widget/
│   │   │   │   ├── floating.ts       # Shadow DOM widget injector
│   │   │   │   └── widget.css
│   │   │   └── lib/
│   │   │       ├── browser-polyfill.ts  # Cross-browser API shim
│   │   │       ├── storage.ts           # Typed storage wrapper
│   │   │       └── messages.ts          # Typed message protocol
│   │   └── build/                    # Per-browser output
│   │
│   ├── web/                          # Marketing site + live demo
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
│   └── engine/                       # Rust engine (Phase 4, desktop)
│       ├── Cargo.toml
│       └── src/
│
├── scripts/
│   ├── build-extension.sh
│   └── dev.sh
│
└── docs/
    └── superpowers/specs/            # Design specs
```

---

## Development Setup

### Prerequisites
- Node.js 20+
- pnpm 9+

### Install & Dev
```bash
pnpm install

# Dev — extension (Chrome, with hot reload)
pnpm dev:extension

# Dev — marketing site
pnpm dev:web

# Build extension (all browsers)
pnpm build:extension

# Build web
pnpm build:web

# Run tests
pnpm test

# Lint
pnpm lint
```

### Loading the Extension in Chrome (Dev)
1. Run `pnpm dev:extension`
2. Open `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked" → select `packages/extension/build/chrome/`
5. Navigate to any site with mic access to test

---

## Coding Conventions

### TypeScript
- **Strict mode** (`"strict": true` in tsconfig)
- Prefer `const` over `let`. Never use `var`
- Named exports only — no default exports
- Use explicit return types on public functions

### React (Popup + Web)
- Functional components only
- Keep components under 150 lines — extract when larger
- Co-locate component, styles, and tests
- Canvas components: use `useRef` + `useEffect` with `requestAnimationFrame`
- Clean up `requestAnimationFrame` and audio resources in effect cleanup

### CSS / Tailwind
- Tailwind CSS 4 — no `tailwind.config.js`, configure via `@theme` in CSS
- Design tokens in CSS custom properties
- Design aesthetic: **"Studio Console Noir"** — dark, precise, professional audio feel
- Fonts: `Instrument Sans` (display), `JetBrains Mono` (values/meters), `Plus Jakarta Sans` (body)

### Extension-Specific
- Content scripts must be minimal — inject at `document_start`, wrap getUserMedia, done
- Background service worker is ephemeral — never rely on in-memory state, always use `chrome.storage`
- Use `webextension-polyfill` for all browser API calls
- Shadow DOM (closed) for floating widget — isolate from page styles
- Typed message protocol between popup ↔ background ↔ content script

### Audio / DSP Conventions
- **Sample rate**: 48kHz everywhere (set AudioContext to 48000)
- **RNNoise frame**: 480 samples (10ms at 48kHz)
- **AudioWorklet quantum**: 128 samples — buffer until 480 accumulated
- **Latency budget**: ~15ms processing, <40ms end-to-end
- **Strength slider**: Wet/dry mix (0% = raw, 100% = fully denoised). RNNoise always runs at full suppression
- **Level metering**: dBFS scale, RMS with peak hold
- All audio buffers use `Float32Array` in range [-1.0, 1.0]
- NEVER allocate inside AudioWorklet `process()` — pre-allocate everything in constructor

---

## AudioWorklet Critical Patterns

### WASM Loading in AudioWorklet
```
1. Extension bundles RNNoise WASM (SINGLE_FILE=1, base64 inline)
2. On first mic request, main thread compiles via WebAssembly.compile()
3. Transfer compiled WebAssembly.Module to worklet via port.postMessage()
4. Worklet constructor: instantiate module synchronously
5. Start processor in pass-through mode until WASM ready
```

### Frame Buffering (128 → 480)
AudioWorklet delivers 128 samples per `process()` call. RNNoise needs 480.
Buffer samples in a ring buffer and only invoke RNNoise when 480 accumulated.
This adds ~10ms latency (acceptable within 40ms budget).

### Memory Rules
- NEVER allocate inside `process()` — GC pauses break real-time audio
- Pre-allocate all `Float32Array` buffers in constructor
- Use `HeapAudioBuffer` pattern for WASM ↔ JS memory copies

---

## Extension State

### Persisted State (`chrome.storage.local`)
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | boolean | true | Global on/off |
| `strength` | number | 75 | 0-100, wet/dry mix |
| `disabledSites` | string[] | [] | Domains where HUSH is off |
| `widgetPinned` | boolean | false | Show floating widget |
| `widgetPosition` | {x, y} | {20, 20} | Widget drag position |

### Message Flow
```
Popup → Background Service Worker → All Content Scripts → AudioWorklet
                                                              ↓ (metrics)
Popup ← Background ← Content Script ← AudioWorklet
```

### Toolbar Icon States
| State | Appearance | Meaning |
|-------|-----------|---------|
| Active | Gradient (cyan→violet) | Processing audio |
| Idle | Dimmed gradient | Enabled, no mic |
| Disabled | Grey | Off globally |
| Site off | Grey + red border | Off for this domain |

---

## Cross-Browser Compatibility

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome/Edge/Brave | Full | MV3 native, all APIs work |
| Firefox | Full (shims) | MV3 since FF109. `Atomics.wait` disabled in worklet — use `waitAsync` |
| Safari 14+ | Caveats | Xcode wrapper needed. User gesture for AudioContext. Latency quirks |

Use `webextension-polyfill` (Mozilla) as base. Custom shim for `Atomics.wait` → `Atomics.waitAsync` in Firefox worklets.

---

## Design System Quick Reference

```css
/* Backgrounds */
--bg-primary:     #06060a;
--bg-secondary:   #0c0c12;
--bg-tertiary:    #12121c;

/* Accents */
--accent-cyan:    #00f0ff;   /* primary CTA, active states */
--accent-magenta: #ff3d71;   /* danger, recording, input peaks */
--accent-green:   #00ff88;   /* success, speech detected, gate open */
--accent-amber:   #ffaa00;   /* warnings, envelope */
--accent-violet:  #a855f7;   /* spectrum, secondary */

/* Typography */
--font-display: 'Instrument Sans', sans-serif;
--font-mono:    'JetBrains Mono', monospace;
--font-body:    'Plus Jakarta Sans', sans-serif;
```

---

## Implementation Phases

### Phase 1 — Extension MVP (Current Priority)
1. Set up monorepo (pnpm workspaces + Turborepo)
2. Build `audio-engine`: AudioWorklet processor with 128→480 frame buffer + noise gate
3. Integrate `@shiguredo/rnnoise-wasm` into worklet
4. Build extension content scripts: getUserMedia hijack + Web Audio graph
5. Build extension background service worker: state management, badge updates
6. Build extension popup: power toggle, strength slider, level meters, site toggle
7. Cross-browser build pipeline (Chrome + Firefox)
8. Test on Work Adventure + Google Meet

### Phase 2 — Extension Polish
- Floating widget (pin to page, shadow DOM, draggable)
- A/B comparison (bypass toggle)
- Keyboard shortcut (Alt+Shift+H)
- Options page (default strength, shortcut config)
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
| WASM binary (inline) | < 6MB | Build output |
| Extension package | < 8MB | Packaged .zip |
| Noise reduction | > 20dB | A/B with pink noise |
| Popup render | < 100ms | First meaningful paint |

---

## Testing Strategy

### Unit Tests (Vitest)
- Frame buffer: ring buffer read/write, 128→480 accumulation
- Noise gate: threshold, envelope follower
- Metering: RMS, dBFS conversion, peak hold
- Storage wrapper: typed get/set
- Message protocol: serialize/deserialize

### Integration Tests
- getUserMedia hijack: verify wrapper intercepts and returns MediaStream
- Audio pipeline: inject known audio → verify output
- WASM loading: compile + transfer to worklet
- Cross-browser: Chrome + Firefox manifest loading

### E2E Tests (Playwright)
- Install extension → navigate to test page → grant mic → verify processing
- Popup: toggle power, change strength, check meters update
- Site disable: turn off for domain, verify bypass
- Widget: pin, drag, unpin

---

## Known Gotchas

1. **Content script timing**: Must run at `document_start` to wrap getUserMedia before page scripts. Use `"run_at": "document_start"` in manifest.
2. **128→480 buffering**: AudioWorklet delivers 128 samples. RNNoise needs 480. Buffer and batch.
3. **RNNoise WASM size**: ~5.5MB with smaller model. `SINGLE_FILE=1` inlines as base64.
4. **Firefox Atomics.wait**: Disabled in AudioWorklet — use `Atomics.waitAsync`.
5. **Safari AudioContext**: Requires user gesture to `resume()`. Handle suspended state.
6. **Shadow DOM for widget**: Use closed shadow DOM to isolate from page CSS.
7. **Multiple getUserMedia calls**: Apps may call it multiple times (device switch). Each must be intercepted.
8. **Video tracks**: getUserMedia may request audio+video. Only process audio — pass video through.
9. **AudioContext per tab**: Each tab gets its own context + WASM instance. Can't share across tabs.
10. **MV3 service worker**: Background can be terminated. Use `chrome.storage`, not in-memory state.

---

## Git Conventions

- Branch naming: `feat/`, `fix/`, `refactor/`, `docs/`
- Commit messages: conventional commits (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`)
- PR per feature/fix — keep PRs focused
- Run `pnpm lint && pnpm typecheck && pnpm test` before committing
