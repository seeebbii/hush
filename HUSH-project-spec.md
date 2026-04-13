# HUSH — Real-Time Noise Cancellation Platform

## Complete Project Specification & Build Prompts

---

## 1. PRODUCT VISION

**HUSH** is an open-source, cross-platform noise cancellation engine that works in two modes:

1. **Browser App** — A web-based tool where users can process microphone audio in real-time with AI-powered noise removal, downloadable recordings, and per-meeting noise profiles.
2. **Desktop App** — A system-level application (Windows/macOS/Linux) that creates a virtual audio device, intercepting microphone input system-wide so that every app (Zoom, Discord, Slack, Google Meet, etc.) automatically gets clean audio without any configuration.

**Core Philosophy:** All audio processing happens locally. Zero data leaves the device. Privacy-first.

---

## 2. HIGH-LEVEL ARCHITECTURE

```
┌─────────────────────────────────────────────────────────┐
│                      HUSH PLATFORM                       │
├──────────────────────┬──────────────────────────────────┤
│   BROWSER APP (Web)  │       DESKTOP APP (Electron)      │
│                      │                                    │
│  React + Vite SPA    │  Electron Shell                    │
│  Web Audio API       │  ├─ Native Audio Engine (Rust)     │
│  AudioWorklet (WASM) │  ├─ Virtual Audio Device Driver    │
│  IndexedDB storage   │  │   ├─ Windows: WASAPI loopback  │
│  PWA installable     │  │   ├─ macOS: CoreAudio plugin    │
│  WebRTC integration  │  │   └─ Linux: PulseAudio module   │
│                      │  ├─ System Tray Controller         │
│                      │  └─ Auto-update (Squirrel/NSIS)    │
├──────────────────────┴──────────────────────────────────┤
│              SHARED AUDIO ENGINE (Rust/WASM)              │
│  ├─ RNNoise (recurrent neural network denoiser)          │
│  ├─ Spectral Noise Gate (soft-knee, envelope follower)   │
│  ├─ Adaptive Noise Floor Estimation                      │
│  ├─ Voice Activity Detection (VAD)                       │
│  ├─ De-reverb Module                                     │
│  └─ AGC (Automatic Gain Control)                         │
├──────────────────────────────────────────────────────────┤
│                 OPTIONAL BACKEND (API)                    │
│  ├─ User accounts & settings sync                        │
│  ├─ Noise profile sharing                                │
│  ├─ Analytics (anonymous usage telemetry)                 │
│  ├─ License management (if commercial)                   │
│  └─ OTA model updates                                    │
└──────────────────────────────────────────────────────────┘
```

---

## 3. AUDIO PROCESSING PIPELINE — DEEP DIVE

This is the heart of the product. Every frame of audio flows through this chain:

```
MIC INPUT (raw PCM, 48kHz, 16-bit)
  │
  ▼
┌──────────────────────┐
│  1. INPUT BUFFER      │  Ring buffer, 20ms frames (960 samples @ 48kHz)
│     & Resampler       │  Resample to 48kHz if device uses different rate
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  2. PRE-ANALYSIS      │  Compute:
│                       │  - RMS level (per-frame energy)
│                       │  - Spectral envelope (FFT, 1024-point)
│                       │  - Zero-crossing rate
│                       │  - Spectral centroid
│                       │  - Cepstral coefficients (13 MFCCs)
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  3. VAD               │  Voice Activity Detection
│  (Voice Activity      │  - Uses energy + spectral features
│   Detection)          │  - Dual-threshold with hangover:
│                       │    - Speech onset: 3 consecutive voiced frames
│                       │    - Speech offset: 15 frame hangover (~300ms)
│                       │  - Outputs: speech_probability (0.0–1.0)
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  4. NOISE FLOOR       │  Adaptive noise estimation (MCRA algorithm)
│     ESTIMATION        │  - Tracks minimum statistics of power spectrum
│                       │  - Updates during non-speech frames
│                       │  - Smoothing factor α = 0.98
│                       │  - Adapts to changing noise (fan turns on/off)
│                       │  - Separate estimate per frequency bin
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  5. SPECTRAL          │  Primary noise removal
│     SUBTRACTION       │  - Wiener filter: H(f) = max(1 - β·N(f)/S(f), floor)
│     + WIENER FILTER   │  - Over-subtraction factor β = 1.0–3.0 (user "strength")
│                       │  - Spectral floor = -40dB (prevents musical noise)
│                       │  - Applies gain curve per frequency bin
│                       │  - 50% overlap-add with Hann window
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  6. RNNoise            │  Neural network denoiser (48kHz, real-time)
│     (ML Denoiser)      │  - GRU-based recurrent network
│                        │  - 22 Bark-scale bands
│                        │  - Trained on 100+ hours of noise/speech
│                        │  - ~5M params, <1ms inference on CPU
│                        │  - Outputs per-band gain mask
└──────────┬────────────┘
           ▼
┌──────────────────────┐
│  7. NOISE GATE        │  Final cleanup
│     (Soft-Knee)       │  - Threshold: user-configurable (-60 to 0 dB)
│                       │  - Soft knee: 10dB transition zone
│                       │  - Attack: 1–100ms (fast open)
│                       │  - Release: 50–500ms (slow close, natural decay)
│                       │  - Reduction: 0–100% (how much to cut)
│                       │  - Envelope follower with RMS smoothing
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  8. DE-REVERB         │  Optional: reduce room echo
│     (Optional)        │  - Spectral decay estimation
│                       │  - Late reverb suppression
│                       │  - Preserves early reflections (natural sound)
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  9. AGC               │  Automatic Gain Control
│     (Auto Gain)       │  - Target level: -18 dBFS
│                       │  - Slow attack (100ms), fast release (10ms)
│                       │  - Limiter at -3 dBFS (prevents clipping)
│                       │  - Makeup gain up to +20dB
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  10. OUTPUT BUFFER    │  Ring buffer → output device/stream
│      & Delivery       │  - Crossfade between frames (anti-glitch)
│                       │  - Latency target: <15ms total pipeline
└──────────────────────┘
```

### 3.1 DSP Implementation Notes

**Frame Size & Latency Budget:**
- Frame size: 20ms (960 samples at 48kHz)
- FFT size: 1024 (zero-padded from 960)
- Overlap: 50% (hop size = 480 samples = 10ms)
- Total algorithmic latency: ~30ms (1.5 frames for overlap-add)
- Target end-to-end: <40ms (imperceptible in calls)

**RNNoise Integration:**
- Compile RNNoise C library to WebAssembly for browser
- Compile RNNoise as native .dylib/.dll/.so for desktop
- Use the same model weights in both targets
- Model file: ~200KB (small enough to bundle)

**Thread Model (Desktop):**
- Audio callback thread: lock-free ring buffer reads/writes only
- Processing thread: runs the DSP chain, writes to output ring buffer
- UI thread: reads meters/visualizer data via atomic shared memory
- Never allocate memory or lock mutexes on the audio thread

---

## 4. FRONTEND SPECIFICATION — BROWSER APP

### 4.1 Tech Stack

| Layer          | Technology                                       |
|----------------|--------------------------------------------------|
| Framework      | React 18+ with TypeScript                        |
| Build Tool     | Vite 5                                           |
| Styling        | Tailwind CSS 4 + CSS custom properties           |
| State          | Zustand (lightweight, no boilerplate)             |
| Audio Engine   | Web Audio API + AudioWorklet + WASM (RNNoise)    |
| Visualizations | Canvas 2D API (waveform, spectrum, meters)       |
| Animations     | Framer Motion                                    |
| Storage        | IndexedDB (via Dexie.js) for recordings/profiles |
| PWA            | Workbox for service worker, installable           |
| Testing        | Vitest + Playwright                               |

### 4.2 Design System

**Aesthetic Direction: "Studio Console Noir"**

This is not a generic SaaS dashboard. This is a professional audio tool that feels like it belongs in a recording studio. Dark, precise, technical — but with moments of electric color that feel alive.

**Color Palette:**
```
--bg-primary:       #06060a        /* near-black, not pure black */
--bg-secondary:     #0c0c12        /* card backgrounds */
--bg-tertiary:      #12121c        /* elevated surfaces */
--bg-hover:         #1a1a28        /* hover states */

--border-subtle:    rgba(255, 255, 255, 0.04)
--border-default:   rgba(255, 255, 255, 0.08)
--border-active:    rgba(255, 255, 255, 0.15)

--text-primary:     #e8e8ed
--text-secondary:   rgba(255, 255, 255, 0.55)
--text-tertiary:    rgba(255, 255, 255, 0.30)
--text-label:       rgba(255, 255, 255, 0.40)

--accent-cyan:      #00f0ff        /* primary accent — active states, primary CTA */
--accent-cyan-glow: rgba(0, 240, 255, 0.15)
--accent-magenta:   #ff3d71        /* danger, recording, input levels */
--accent-violet:    #a855f7        /* spectrum, secondary data */
--accent-green:     #00ff88        /* success, speech detected, gate open */
--accent-amber:     #ffaa00        /* warnings, envelope, release */
--accent-blue:      #3b82f6        /* links, informational */
```

**Typography:**
```
--font-display:  'Instrument Sans', sans-serif   /* Headlines, brand */
--font-mono:     'JetBrains Mono', monospace      /* Values, labels, meters */
--font-body:     'Plus Jakarta Sans', sans-serif  /* Body text, descriptions */

--text-xs:   10px / 1.4   letter-spacing: 2.5px   uppercase (labels)
--text-sm:   12px / 1.5   letter-spacing: 0.5px   (descriptions)
--text-base: 14px / 1.6                           (body)
--text-lg:   18px / 1.3   letter-spacing: -0.3px  (headings)
--text-xl:   24px / 1.2   letter-spacing: -0.5px  (page titles)
--text-2xl:  32px / 1.1   letter-spacing: -1px    (hero numbers)
--text-val:  16px / 1.0   tabular-nums             (meter values)
```

**Component Design Tokens:**
```
--radius-sm:    6px
--radius-md:    10px
--radius-lg:    14px
--radius-xl:    20px
--radius-full:  9999px

--shadow-glow:     0 0 20px var(--accent-cyan-glow)
--shadow-card:     0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px var(--border-subtle)
--shadow-elevated: 0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px var(--border-default)

--transition-fast:   120ms cubic-bezier(0.25, 0.1, 0.25, 1)
--transition-normal: 250ms cubic-bezier(0.25, 0.1, 0.25, 1)
--transition-slow:   500ms cubic-bezier(0.16, 1, 0.3, 1)
```

**Audio-Specific UI Components to Build:**
- `<Knob>` — Rotary control with drag interaction, value tooltip, arc indicator
- `<Fader>` — Vertical/horizontal slider styled as a mixing console fader
- `<LevelMeter>` — Stereo VU meter with peak hold, segmented or continuous
- `<Waveform>` — Real-time scrolling waveform, Canvas-based, 60fps
- `<Spectrum>` — FFT frequency spectrum with logarithmic scale, smoothed bars
- `<Spectrogram>` — Scrolling time-frequency heatmap (waterfall display)
- `<GateIndicator>` — Visual showing gate open/closed state with threshold line
- `<NoiseFloor>` — Live display of estimated noise floor vs. signal
- `<VoiceIndicator>` — VAD confidence ring/badge, pulses when speech detected

### 4.3 Page-by-Page UI Specification

#### PAGE 1: LANDING / HERO

```
┌─────────────────────────────────────────────────┐
│  [Logo] HUSH.audio              [Try Free] [↓]  │
├─────────────────────────────────────────────────┤
│                                                  │
│         ┌──────────────────────────┐            │
│         │   ANIMATED WAVEFORM      │            │
│         │   noisy → clean morph    │            │
│         └──────────────────────────┘            │
│                                                  │
│     Your voice. Nothing else.                    │
│                                                  │
│  AI-powered noise cancellation that runs         │
│  entirely in your browser. No uploads.           │
│  No servers. No compromise.                      │
│                                                  │
│        [ ▶ Try It Now — No Signup ]              │
│        [ ↓ Download Desktop App   ]              │
│                                                  │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐           │
│  │<15ms │ │100%  │ │ WASM │ │ Free │           │
│  │Delay │ │Local │ │ Fast │ │ OSS  │           │
│  └──────┘ └──────┘ └──────┘ └──────┘           │
│                                                  │
│  [Before/After Audio Demo — Interactive]         │
│                                                  │
├─────────────────────────────────────────────────┤
│  HOW IT WORKS                                    │
│  ┌─────┐ → ┌─────┐ → ┌─────┐ → ┌─────┐        │
│  │ Mic │   │ FFT │   │ AI  │   │Clean│        │
│  │Input│   │Anal.│   │Gate │   │Audio│        │
│  └─────┘   └─────┘   └─────┘   └─────┘        │
│  Animated pipeline with flowing particles        │
│                                                  │
├─────────────────────────────────────────────────┤
│  NOISE TYPES WE KILL                             │
│  [Keyboard] [Fan] [Traffic] [Dog] [Baby]         │
│  [Construction] [Café] [AC Hum] [Echo]           │
│  Each is a card with a waveform that             │
│  morphs from noisy to clean on hover             │
│                                                  │
├─────────────────────────────────────────────────┤
│  Footer: GitHub | Docs | Privacy | Made with ♥  │
└─────────────────────────────────────────────────┘
```

**Landing Page Animation Requirements:**
- Hero waveform: continuously animated, showing noisy audio morphing to clean
- Use `<canvas>` with procedural noise generation that gets "filtered" in real-time
- Pipeline section: particles flow left to right through each stage
- Noise type cards: each has a unique noise waveform texture
- Scroll-triggered reveals with staggered delays
- Gradient mesh background with slow drifting animation
- Performance: all animations must hit 60fps, use `requestAnimationFrame`

#### PAGE 2: APP (Main Processing Interface)

```
┌─────────────────────────────────────────────────────────────┐
│  [Logo] HUSH.audio    [Input: MacBook Pro Mic ▼]   [⚙] [?] │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─── STATUS BAR ───────────────────────────────────────┐   │
│  │ ● ACTIVE  │  Latency: 12ms  │  CPU: 3.2%  │  48kHz  │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─── MAIN TOGGLE ──────────────────────────────────────┐   │
│  │                                                       │   │
│  │   ╭───────────────────────────────────────────╮       │   │
│  │   │         ┌──────────────┐                  │       │   │
│  │   │         │  POWER RING  │   Noise          │       │   │
│  │   │         │  (animated   │   Cancellation   │       │   │
│  │   │         │   glow ring) │                  │       │   │
│  │   │         └──────────────┘   ● Enabled      │       │   │
│  │   │                                            │       │   │
│  │   ╰───────────────────────────────────────────╯       │   │
│  │                                                       │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─── VISUALIZER PANEL ─────────────────────────────────┐   │
│  │  [Waveform] [Spectrum] [Spectrogram]    ← tab switch  │   │
│  │                                                       │   │
│  │  ┌─────────────────────────────────────────────────┐  │   │
│  │  │                                                  │  │   │
│  │  │           < ACTIVE VISUALIZATION >               │  │   │
│  │  │         600 x 160px canvas, 60fps                │  │   │
│  │  │                                                  │  │   │
│  │  └─────────────────────────────────────────────────┘  │   │
│  │                                                       │   │
│  │  INPUT ████████████████░░░░░░ -18.2 dB               │   │
│  │  OUTPUT ██████████░░░░░░░░░░░ -32.5 dB               │   │
│  │  REDUCTION ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 14.3 dB                │   │
│  │                                                       │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─── CONTROLS ─────────────────────────────────────────┐   │
│  │                                                       │   │
│  │  ╭────╮   ╭────╮   ╭────╮   ╭────╮   ╭────╮         │   │
│  │  │ TH │   │ STR│   │ ATK│   │ REL│   │ AGC│         │   │
│  │  │    │   │    │   │    │   │    │   │    │         │   │
│  │  ╰────╯   ╰────╯   ╰────╯   ╰────╯   ╰────╯         │   │
│  │  -35dB    85%      5ms      50ms     -18dB           │   │
│  │  THRESH   STRENGTH  ATTACK   RELEASE  TARGET          │   │
│  │                                                       │   │
│  │  [═══════●════════] Noise Floor (auto-detected)       │   │
│  │                                                       │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─── VOICE ACTIVITY ──────────────────────────────────┐    │
│  │                                                      │    │
│  │   SPEECH ████████████████████░░░░░░░░ 78%            │    │
│  │                                                      │    │
│  │   Gate: OPEN │ Noise Removed: ~14dB │ Voice: YES     │    │
│  │                                                      │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─── QUICK ACTIONS ───────────────────────────────────┐    │
│  │  [⊙ Record Clean]  [A/B Compare]  [Save Profile]    │    │
│  │  [Export Settings]  [Reset All]    [Keyboard Guide]  │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  Processing at 48kHz · AudioWorklet + WASM · 100% local     │
└─────────────────────────────────────────────────────────────┘
```

#### PAGE 3: SETTINGS / PREFERENCES

```
┌─────────────────────────────────────────┐
│  ⚙ Settings                             │
├─────────────────────────────────────────┤
│                                          │
│  AUDIO                                   │
│  ├─ Input Device          [Dropdown]     │
│  ├─ Sample Rate           [48kHz ▼]      │
│  ├─ Buffer Size           [256 ▼]        │
│  ├─ Bit Depth             [16-bit ▼]     │
│  └─ Channels              [Mono ▼]       │
│                                          │
│  PROCESSING                              │
│  ├─ Engine Mode       [Balanced ▼]       │
│  │   ├─ Performance (low CPU, basic)     │
│  │   ├─ Balanced (recommended)           │
│  │   └─ Quality (max suppression)        │
│  ├─ De-reverb            [Toggle]        │
│  ├─ Auto Gain Control    [Toggle]        │
│  ├─ Voice Enhancement    [Toggle]        │
│  └─ Keyboard Suppression [Toggle]        │
│                                          │
│  PROFILES                                │
│  ├─ Active: "Home Office"                │
│  ├─ [+ New Profile]                      │
│  ├─ Saved:                               │
│  │   ├─ Home Office     [Load] [✕]       │
│  │   ├─ Coffee Shop     [Load] [✕]       │
│  │   └─ Commute         [Load] [✕]       │
│  └─ [Import] [Export All]                │
│                                          │
│  APPEARANCE                              │
│  ├─ Theme              [Dark ▼]          │
│  ├─ Accent Color       [Cyan ●]          │
│  ├─ Visualizer FPS     [60 ▼]            │
│  └─ Reduce Animations  [Toggle]          │
│                                          │
│  KEYBOARD SHORTCUTS                      │
│  ├─ Toggle NC:    Ctrl+Shift+N           │
│  ├─ Mute:         Ctrl+Shift+M           │
│  ├─ A/B Compare:  Ctrl+Shift+A           │
│  └─ Record:       Ctrl+Shift+R           │
│                                          │
│  ABOUT                                   │
│  ├─ Version: 1.0.0                       │
│  ├─ Engine: RNNoise v0.9 + SpectralGate  │
│  ├─ [GitHub] [Report Bug] [Docs]         │
│  └─ License: MIT                         │
│                                          │
└─────────────────────────────────────────┘
```

### 4.4 Frontend Feature Breakdown

**P0 — Must Have (MVP):**
- Microphone capture with device selection
- Real-time noise gate processing via AudioWorklet
- RNNoise WASM integration for ML-based denoising
- Waveform + spectrum visualizer (Canvas 2D, 60fps)
- Input/output level meters with dB readout
- Master on/off toggle
- Threshold, strength, attack, release controls (knob UI)
- A/B comparison toggle (bypass processing)
- Responsive layout (works on mobile browsers too)
- PWA manifest + service worker (installable)

**P1 — Should Have:**
- Noise profiles (save/load/share parameter presets)
- Recording capability (record processed audio to WebM/WAV)
- Spectrogram view (scrolling time-frequency heatmap)
- Keyboard shortcuts (toggle, mute, record)
- Voice activity indicator with confidence percentage
- Noise reduction meter (shows how much noise was removed in dB)
- Performance monitoring (CPU %, latency, buffer health)
- Settings persistence (IndexedDB)

**P2 — Nice to Have:**
- Before/after demo on landing page (pre-recorded samples)
- Multiple noise profiles with auto-detection
- De-reverb processing module
- AGC (automatic gain control)
- WebRTC integration helper (guide for using with Google Meet etc.)
- Multi-language UI (i18n)
- Theming (light/dark/custom accent colors)
- Audio file upload mode (process pre-recorded audio, not just live mic)
- Export processed audio as WAV/MP3
- Share noise profile via URL

---

## 5. DESKTOP APP SPECIFICATION

### 5.1 Tech Stack

| Layer              | Technology                                                      |
|--------------------|-----------------------------------------------------------------|
| App Shell          | Electron 30+ (or Tauri 2.0 for smaller binary)                 |
| Audio Engine       | Rust (cpal + hound + rustfft)                                   |
| ML Inference       | ONNX Runtime (Rust bindings) or native RNNoise C via FFI        |
| Virtual Audio      | Platform-specific (see below)                                   |
| UI Framework       | React (shared with browser app, embedded in Electron)           |
| IPC                | Electron IPC / Tauri commands                                   |
| Auto-Update        | electron-updater / Tauri updater                                |
| Installer          | NSIS (Windows), DMG (macOS), AppImage/deb (Linux)               |
| System Tray        | Native tray icon with context menu                              |

### 5.2 Virtual Audio Device Architecture

This is what makes the desktop app "just work" — it creates a fake microphone that other apps see as a real device.

**Windows:**
```
Real Mic → WASAPI Capture → Rust DSP Engine → Virtual Audio Cable (VAC)
                                                    ↓
                                              "HUSH Mic" appears
                                              in Zoom/Discord/etc.

Implementation options:
  Option A: Windows Audio Session API (WASAPI) loopback
    - Use `windows-audio-device` crate
    - Register as audio endpoint
    - Requires signed driver (complex)

  Option B: Virtual Audio Cable SDK integration
    - Bundle VB-CABLE or use VAC SDK
    - Create virtual device programmatically
    - Easier to implement, dependency on third-party

  Option C: Windows.Devices.Custom (UWP)
    - Modern Windows audio endpoint
    - Requires Windows 10+
    - Best long-term solution
```

**macOS:**
```
Real Mic → CoreAudio Input → Rust DSP Engine → CoreAudio HAL Plugin
                                                    ↓
                                              "HUSH Mic" appears
                                              in system audio prefs

Implementation:
  - AudioServerPlugin (HAL plugin)
  - Requires notarization + entitlements
  - Alternative: use BlackHole (open-source virtual audio)
  - Create aggregate device combining real mic + virtual output
```

**Linux:**
```
Real Mic → PulseAudio/PipeWire Source → Rust DSP Engine → Virtual Sink
                                                              ↓
                                                        "HUSH Mic"
                                                        in pavucontrol

Implementation:
  - PipeWire: create virtual source node
  - PulseAudio: `pactl load-module module-null-sink`
  - Route real mic → null sink → HUSH processing → virtual source
  - PipeWire filter graph is the cleanest approach
```

### 5.3 Desktop App Feature Set

**System Tray Behavior:**
- App lives in system tray (not taskbar)
- Single-click: toggle noise cancellation on/off
- Double-click: open main window
- Right-click context menu:
  - ● Noise Cancellation: ON
  - Input: MacBook Pro Microphone
  - Output: HUSH Virtual Mic
  - ─────────────
  - Strength: ████████░░ 80%
  - ─────────────
  - Profiles → Home / Office / Café
  - Settings
  - ─────────────
  - Quit HUSH

**Auto-start:**
- Option to launch at system startup
- Start minimized to tray
- Remember last-used profile

**Global Hotkeys:**
- Ctrl+Shift+H: Toggle noise cancellation
- Ctrl+Shift+M: Mute/unmute
- Customizable via settings

**Tray Icon States:**
- 🟢 Green dot overlay: NC active, voice detected
- 🔵 Blue: NC active, no voice (quiet)
- ⚫ Grey: NC disabled (bypass mode)
- 🔴 Red: Error (no mic access, driver issue)

### 5.4 Desktop Rust Audio Engine

```rust
// Pseudocode for the core processing loop

struct HushEngine {
    config: ProcessingConfig,
    noise_gate: NoiseGate,
    rnnoise: RNNoiseState,
    vad: VoiceActivityDetector,
    noise_estimator: NoiseFloorEstimator,
    agc: AutoGainControl,
    input_ring: RingBuffer<f32>,
    output_ring: RingBuffer<f32>,
    metrics: Arc<AtomicMetrics>,
}

impl HushEngine {
    fn process_frame(&mut self, input: &[f32], output: &mut [f32]) {
        // 1. Copy input to analysis buffer
        let frame = self.input_ring.write_and_read(input);

        // 2. Run VAD
        let vad_result = self.vad.process(&frame);
        self.metrics.store_vad(vad_result.speech_probability);

        // 3. Update noise floor estimate (only during non-speech)
        if vad_result.speech_probability < 0.3 {
            self.noise_estimator.update(&frame);
        }

        // 4. Spectral subtraction / Wiener filter
        let mut processed = self.spectral_subtract(
            &frame,
            self.noise_estimator.get_floor(),
            self.config.strength,
        );

        // 5. RNNoise ML denoising
        if self.config.ml_denoise_enabled {
            self.rnnoise.process_frame(&mut processed);
        }

        // 6. Noise gate
        self.noise_gate.process(&mut processed, &self.config);

        // 7. AGC
        if self.config.agc_enabled {
            self.agc.process(&mut processed);
        }

        // 8. Write to output
        output.copy_from_slice(&processed);

        // 9. Update metrics
        let input_rms = rms_db(&frame);
        let output_rms = rms_db(&processed);
        self.metrics.store_levels(input_rms, output_rms);
    }
}
```

---

## 6. BACKEND API SPECIFICATION (Optional)

The backend is optional — the app works fully offline. But for premium features:

### 6.1 Tech Stack

| Layer     | Technology                              |
|-----------|-----------------------------------------|
| Runtime   | Node.js 20+ or Rust (Axum)              |
| API       | REST + WebSocket                        |
| Database  | PostgreSQL 16 (users, profiles)         |
| Cache     | Redis (sessions, rate limiting)         |
| Auth      | JWT + OAuth2 (Google, GitHub)           |
| Storage   | S3-compatible (noise profile sharing)   |
| Hosting   | Fly.io / Railway / self-hosted          |
| Monitoring| Prometheus + Grafana                    |

### 6.2 API Endpoints

```
AUTH
  POST   /api/auth/register          Create account
  POST   /api/auth/login             Login (returns JWT)
  POST   /api/auth/oauth/google      OAuth2 flow
  POST   /api/auth/refresh           Refresh token
  DELETE /api/auth/logout             Invalidate session

USER
  GET    /api/user/me                 Current user info
  PATCH  /api/user/me                 Update profile
  DELETE /api/user/me                 Delete account + all data

PROFILES (Noise Cancellation Presets)
  GET    /api/profiles                List user's profiles
  POST   /api/profiles                Create new profile
  GET    /api/profiles/:id            Get profile details
  PUT    /api/profiles/:id            Update profile
  DELETE /api/profiles/:id            Delete profile
  POST   /api/profiles/:id/share      Generate share link
  GET    /api/profiles/shared/:token  Get shared profile

SETTINGS
  GET    /api/settings                Get synced settings
  PUT    /api/settings                Update synced settings

TELEMETRY (Anonymous, opt-in)
  POST   /api/telemetry/event         Send anonymous usage event

MODELS (OTA model updates)
  GET    /api/models/latest           Check for model updates
  GET    /api/models/:version/download Download model weights
```

### 6.3 Database Schema

```sql
-- Users
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255),
    display_name    VARCHAR(100),
    avatar_url      TEXT,
    auth_provider   VARCHAR(20) DEFAULT 'email',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Noise Profiles
CREATE TABLE profiles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    config          JSONB NOT NULL,
    -- config contains: threshold, reduction, attack, release,
    -- strength, agc_target, dereverb_enabled, engine_mode, etc.
    is_default      BOOLEAN DEFAULT FALSE,
    share_token     VARCHAR(32) UNIQUE,
    download_count  INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Synced Settings
CREATE TABLE settings (
    user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    preferences     JSONB NOT NULL DEFAULT '{}',
    -- UI preferences, keybindings, theme, etc.
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Anonymous Telemetry Events
CREATE TABLE telemetry (
    id              BIGSERIAL PRIMARY KEY,
    event_type      VARCHAR(50) NOT NULL,
    platform        VARCHAR(20),   -- 'web', 'windows', 'macos', 'linux'
    app_version     VARCHAR(20),
    engine_mode     VARCHAR(20),
    session_duration_seconds INTEGER,
    avg_noise_reduction_db   REAL,
    metadata        JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_telemetry_type ON telemetry(event_type);
CREATE INDEX idx_telemetry_created ON telemetry(created_at);
```

---

## 7. PROJECT STRUCTURE

```
hush/
├── README.md
├── LICENSE (MIT)
├── .github/
│   └── workflows/
│       ├── ci.yml              # Lint + test on PR
│       ├── build-web.yml       # Build & deploy web app
│       └── build-desktop.yml   # Build desktop installers
│
├── packages/
│   ├── web/                    # Browser app (React + Vite)
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   ├── tailwind.config.ts
│   │   ├── public/
│   │   │   ├── manifest.json
│   │   │   ├── sw.js
│   │   │   ├── favicon.svg
│   │   │   └── og-image.png
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── App.tsx
│   │       ├── router.tsx
│   │       ├── styles/
│   │       │   ├── globals.css
│   │       │   └── tokens.css        # Design tokens
│   │       ├── components/
│   │       │   ├── ui/               # Generic UI primitives
│   │       │   │   ├── Button.tsx
│   │       │   │   ├── Toggle.tsx
│   │       │   │   ├── Select.tsx
│   │       │   │   ├── Tooltip.tsx
│   │       │   │   └── Modal.tsx
│   │       │   ├── audio/            # Audio-specific components
│   │       │   │   ├── Knob.tsx
│   │       │   │   ├── Fader.tsx
│   │       │   │   ├── LevelMeter.tsx
│   │       │   │   ├── Waveform.tsx
│   │       │   │   ├── Spectrum.tsx
│   │       │   │   ├── Spectrogram.tsx
│   │       │   │   ├── GateIndicator.tsx
│   │       │   │   └── VoiceIndicator.tsx
│   │       │   ├── layout/
│   │       │   │   ├── Header.tsx
│   │       │   │   ├── StatusBar.tsx
│   │       │   │   └── Footer.tsx
│   │       │   └── landing/
│   │       │       ├── Hero.tsx
│   │       │       ├── Pipeline.tsx
│   │       │       ├── NoiseCards.tsx
│   │       │       └── BeforeAfter.tsx
│   │       ├── pages/
│   │       │   ├── Landing.tsx
│   │       │   ├── App.tsx           # Main processing UI
│   │       │   └── Settings.tsx
│   │       ├── engine/               # Audio processing
│   │       │   ├── AudioEngine.ts    # Orchestrates Web Audio graph
│   │       │   ├── worklets/
│   │       │   │   ├── noise-gate.worklet.ts
│   │       │   │   ├── rnnoise.worklet.ts
│   │       │   │   └── agc.worklet.ts
│   │       │   ├── wasm/
│   │       │   │   ├── rnnoise.wasm
│   │       │   │   └── rnnoise.js    # WASM glue
│   │       │   ├── vad.ts
│   │       │   ├── noise-estimator.ts
│   │       │   └── dsp-utils.ts      # FFT, windowing, RMS
│   │       ├── stores/
│   │       │   ├── audioStore.ts     # Zustand: engine state
│   │       │   ├── settingsStore.ts  # Zustand: user prefs
│   │       │   └── profileStore.ts   # Zustand: noise profiles
│   │       ├── hooks/
│   │       │   ├── useAudioEngine.ts
│   │       │   ├── useDevices.ts
│   │       │   ├── useLevels.ts
│   │       │   └── useKeyboardShortcuts.ts
│   │       ├── lib/
│   │       │   ├── db.ts             # Dexie.js IndexedDB
│   │       │   ├── api.ts            # Backend API client
│   │       │   └── analytics.ts      # Anonymous telemetry
│   │       └── types/
│   │           ├── audio.ts
│   │           └── profile.ts
│   │
│   ├── desktop/                # Electron / Tauri shell
│   │   ├── package.json
│   │   ├── electron.config.ts
│   │   ├── src/
│   │   │   ├── main/
│   │   │   │   ├── index.ts          # Electron main process
│   │   │   │   ├── tray.ts           # System tray logic
│   │   │   │   ├── shortcuts.ts      # Global hotkeys
│   │   │   │   ├── autostart.ts      # Launch at boot
│   │   │   │   └── updater.ts        # Auto-update
│   │   │   ├── preload/
│   │   │   │   └── index.ts          # Bridge to renderer
│   │   │   └── native/
│   │   │       ├── audio-bridge.ts   # IPC to Rust engine
│   │   │       └── virtual-device.ts # Platform-specific device mgmt
│   │   ├── assets/
│   │   │   ├── icon.png
│   │   │   ├── tray-active.png
│   │   │   ├── tray-inactive.png
│   │   │   └── tray-error.png
│   │   └── installers/
│   │       ├── windows/
│   │       │   └── nsis.config.ts
│   │       ├── macos/
│   │       │   └── dmg.config.ts
│   │       └── linux/
│   │           └── appimage.config.ts
│   │
│   ├── engine/                 # Shared Rust audio engine
│   │   ├── Cargo.toml
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── pipeline.rs       # Main processing chain
│   │   │   ├── noise_gate.rs     # Soft-knee gate
│   │   │   ├── spectral.rs       # FFT, Wiener filter
│   │   │   ├── rnnoise.rs        # RNNoise FFI bindings
│   │   │   ├── vad.rs            # Voice activity detection
│   │   │   ├── agc.rs            # Auto gain control
│   │   │   ├── dereverb.rs       # De-reverberation
│   │   │   ├── ring_buffer.rs    # Lock-free ring buffer
│   │   │   ├── metrics.rs        # Atomic metrics (levels, VAD)
│   │   │   └── config.rs         # Processing parameters
│   │   ├── wasm/                 # WASM build target
│   │   │   ├── Cargo.toml
│   │   │   └── src/
│   │   │       └── lib.rs        # wasm-bindgen exports
│   │   └── benches/
│   │       └── pipeline_bench.rs
│   │
│   └── server/                 # Optional backend
│       ├── package.json
│       ├── src/
│       │   ├── index.ts
│       │   ├── routes/
│       │   │   ├── auth.ts
│       │   │   ├── profiles.ts
│       │   │   ├── settings.ts
│       │   │   └── telemetry.ts
│       │   ├── middleware/
│       │   │   ├── auth.ts
│       │   │   └── rateLimit.ts
│       │   ├── db/
│       │   │   ├── schema.sql
│       │   │   └── client.ts
│       │   └── lib/
│       │       └── jwt.ts
│       └── Dockerfile
│
├── docs/
│   ├── architecture.md
│   ├── dsp-pipeline.md
│   ├── virtual-audio-devices.md
│   ├── contributing.md
│   └── deployment.md
│
└── scripts/
    ├── build-wasm.sh           # Compile Rust → WASM
    ├── build-desktop.sh        # Package desktop installers
    └── dev.sh                  # Start all packages in dev mode
```

---

## 8. IMPLEMENTATION ROADMAP

### Phase 1 — Web MVP (Weeks 1–3)
- [ ] Set up monorepo (pnpm workspaces)
- [ ] Implement AudioWorklet noise gate (TypeScript)
- [ ] Compile RNNoise to WASM, integrate into worklet
- [ ] Build main processing UI (React + Canvas visualizers)
- [ ] Device selection, toggle, knob controls
- [ ] Level meters (input/output/reduction)
- [ ] A/B comparison mode
- [ ] PWA manifest + service worker
- [ ] Deploy to Vercel/Cloudflare Pages

### Phase 2 — Web Polish (Weeks 4–5)
- [ ] Landing page with animated hero
- [ ] Spectrogram visualizer
- [ ] Noise profiles (save/load via IndexedDB)
- [ ] Recording capability (MediaRecorder → WAV)
- [ ] Keyboard shortcuts
- [ ] Settings page with persistence
- [ ] Performance monitoring overlay
- [ ] Responsive mobile layout

### Phase 3 — Rust Engine (Weeks 6–8)
- [ ] Set up Rust crate with cpal for audio I/O
- [ ] Port DSP pipeline: noise gate, spectral subtraction, VAD
- [ ] Integrate RNNoise via C FFI
- [ ] Build WASM target (wasm-pack)
- [ ] Replace TypeScript AudioWorklet with WASM-powered worklet
- [ ] Benchmark: measure latency, CPU usage, quality

### Phase 4 — Desktop App (Weeks 9–12)
- [ ] Electron/Tauri shell with React frontend
- [ ] IPC bridge to Rust audio engine (N-API or Tauri commands)
- [ ] Virtual audio device (start with macOS BlackHole integration)
- [ ] System tray with status indicator
- [ ] Global hotkeys
- [ ] Auto-start at login
- [ ] Windows virtual audio (VB-Cable or custom WASAPI)
- [ ] Linux PipeWire/PulseAudio virtual source
- [ ] Auto-update system
- [ ] Build installers (DMG, NSIS, AppImage)

### Phase 5 — Backend & Polish (Weeks 13–14)
- [ ] Backend API (auth, profiles, settings sync)
- [ ] Cloud profile sharing (share via link)
- [ ] Anonymous telemetry (opt-in)
- [ ] Documentation site
- [ ] GitHub Actions CI/CD for all platforms
- [ ] Beta testing, bug fixes, performance tuning

---

## 9. PERFORMANCE TARGETS

| Metric                  | Target      | Measurement Method               |
|-------------------------|-------------|-----------------------------------|
| End-to-end latency      | < 40ms      | Round-trip audio measurement       |
| CPU usage (web)         | < 5%        | Performance.now() in worklet       |
| CPU usage (desktop)     | < 3%        | OS-level process monitoring        |
| Memory (web)            | < 80MB      | Chrome DevTools memory profiler    |
| Memory (desktop)        | < 50MB RSS  | OS-level process monitoring        |
| WASM module size        | < 500KB     | gzip compressed                   |
| Desktop installer       | < 30MB      | Final packaged size               |
| Noise reduction         | > 20dB      | A/B measurement with pink noise   |
| Speech MOS score        | > 4.0/5.0   | PESQ or POLQA measurement         |
| Visualizer FPS          | 60fps       | requestAnimationFrame timing       |

---

## 10. TESTING STRATEGY

**Unit Tests:**
- DSP functions (FFT, windowing, RMS, dB conversion)
- Noise gate logic (threshold, envelope follower)
- VAD classification accuracy
- Ring buffer read/write correctness

**Integration Tests:**
- Full pipeline: inject known audio → verify output spectrum
- AudioWorklet message passing
- WASM ↔ JavaScript bridge
- Profile save/load roundtrip

**E2E Tests (Playwright):**
- Mic permission flow
- Toggle noise cancellation
- Change device
- Record and download
- Settings persistence across reload

**Audio Quality Tests:**
- Inject calibrated noise + speech → measure SNR improvement
- Verify no clipping at output
- Verify latency meets target
- A/B listening tests with human evaluators

---

## 11. SECURITY & PRIVACY

- All audio processing is local (browser/desktop). Audio never leaves the device.
- No audio is stored unless the user explicitly records.
- Backend stores only account info, profiles (JSON configs), and preferences.
- Anonymous telemetry is opt-in and contains zero audio data.
- Desktop app does not require admin/root for basic operation.
- Virtual audio device drivers are signed (Windows) / notarized (macOS).
- HTTPS everywhere. JWT tokens with 24h expiry + refresh rotation.
- GDPR compliant: full data export and deletion on request.

---

*This document serves as the complete technical specification for building HUSH. Each section is designed to be handed to a developer or AI coding assistant as a self-contained prompt for implementation.*
