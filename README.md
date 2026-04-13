# HUSH — Real-Time Noise Cancellation

AI-powered noise cancellation that runs entirely in your browser. No uploads. No servers. No compromise.

HUSH is a browser extension that intercepts your microphone audio and removes background noise in real-time using [RNNoise](https://jmvalin.ca/demo/rnnoise/) — a recurrent neural network trained for noise suppression. Works on any website: Google Meet, Work Adventure, Discord, Zoom Web, and more.

## Features

- **Universal** — Works on any website that uses your microphone
- **Privacy-first** — All processing happens locally in your browser. Zero audio data leaves your device
- **RNNoise AI** — ML-based noise suppression trained on 100+ hours of noise/speech data
- **VAD Gate** — Voice Activity Detection gate that silences non-speech segments
- **Real-time meters** — See input/output levels and noise reduction in dB
- **Floating widget** — Pin a compact status widget to any page
- **Keyboard shortcut** — Toggle globally (`Alt+Shift+H` on Windows/Linux, `Ctrl+Shift+H` on Mac)
- **Auto mic selection** — Remembers your preferred microphone across page reloads
- **Monitor mode** — Hear your processed audio in headphones to verify quality
- **Per-site control** — Disable HUSH on specific domains
- **Cross-browser** — Chrome, Edge, Brave (Firefox 128+, Safari with caveats)

## Install

### From zip (development)

1. Download `hush-chrome-v0.2.0.zip`
2. Unzip it
3. Open `chrome://extensions`
4. Enable **Developer mode** (top right)
5. Click **Load unpacked**
6. Select the `chrome` folder

### From source

```bash
# Prerequisites: Node.js 20+, pnpm 9+
git clone https://github.com/seeebbii/hush.git
cd hush
pnpm install
pnpm build:extension
```

Then load `packages/extension/dist/chrome/` as an unpacked extension.

## Usage

1. Click the **HUSH** icon in your browser toolbar
2. Adjust **Strength** (0-100%):
   - 0-30%: Light denoising (RNNoise only)
   - 30-70%: Moderate (RNNoise + light VAD gate)
   - 70-100%: Aggressive (only your close voice passes through)
3. Toggle **Monitor** to hear your processed audio (use headphones)
4. Press `Alt+Shift+H` (Windows/Linux) or `Ctrl+Shift+H` (Mac) to toggle without opening the popup
5. Click ⚙ for full settings (preferred mic, disabled sites, etc.)

## How It Works

```
Your Mic → getUserMedia hijack → AudioWorklet → RNNoise WASM → VAD Gate → Clean Audio → Page
```

1. Content script wraps `navigator.mediaDevices.getUserMedia` at `document_start`
2. When any page requests mic access, HUSH intercepts the call
3. Raw audio routes through an AudioWorklet running RNNoise WASM
4. RNNoise (neural network) removes broadband noise
5. VAD-driven gate silences non-speech segments
6. Clean MediaStream returns to the page — WebRTC, recording, everything works normally

The page never knows its audio is being processed.

## Architecture

```
packages/
├── audio-engine/     # Shared audio processing (FrameBuffer, NoiseGate, metering)
├── extension/        # Browser extension
│   ├── src/
│   │   ├── content/      # getUserMedia hijack (main-world + bridge)
│   │   ├── background/   # Service worker (state, badge, shortcuts)
│   │   ├── popup/        # React popup UI
│   │   ├── options/      # Settings page
│   │   ├── widget/       # Floating widget (Shadow DOM)
│   │   ├── worklet/      # AudioWorklet + RNNoise WASM
│   │   └── lib/          # Storage, messages, browser polyfill
│   └── dist/             # Build output per browser
└── engine/           # Rust engine (future, for desktop app)
```

## Development

```bash
pnpm install                    # Install dependencies
pnpm dev:extension              # Watch mode (Chrome)
pnpm build:extension            # Production build (Chrome)
pnpm build:extension:firefox    # Production build (Firefox)
pnpm test                       # Run tests
```

Load the extension from `packages/extension/dist/chrome/` in Chrome's developer mode. After code changes, refresh the extension in `chrome://extensions` and reload the page.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Extension API | WebExtensions Manifest V3 |
| Audio Processing | AudioWorklet + RNNoise WASM |
| ML Denoiser | [@shiguredo/rnnoise-wasm](https://github.com/shiguredo/rnnoise-wasm) |
| Popup/Options UI | React 18 + TypeScript |
| Styling | Tailwind CSS 4 |
| Build | Vite 6 + vite-plugin-web-extension |
| Monorepo | pnpm workspaces + Turborepo |

## Performance

| Metric | Value |
|--------|-------|
| Processing latency | ~10ms |
| WASM binary | ~3.2MB (gzip) |
| Extension package | ~3.5MB |
| CPU per tab | < 5% |

## License

MIT
