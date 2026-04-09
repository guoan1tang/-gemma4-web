# Gemma Web Chat - Design Specification

**Date:** 2026-04-08
**Topic:** Browser-based local AI chat using Gemma models via WebGPU/WebLLM

## Overview

A web chat interface that runs Gemma models entirely in the browser using WebGPU and the `@mlc-ai/web-llm` library. No backend AI proxy needed — inference runs locally on the user's GPU. The initial release uses Gemma 2 family models, with support for Gemma 4 models when available in WebLLM.

## Architecture

### File Structure

```
public/
  index.html        # Main page with UI layout
  app.js            # WebLLM engine integration + app orchestration
  ui.js             # Chat UI rendering + Markdown (via marked library)
  store.js          # IndexedDB conversation persistence
server/
  index.js          # Express static file server (simplified, no AI proxy)
```

### Technology Choices

- **AI Engine:** `@mlc-ai/web-llm` loaded via importmap from CDN (jsdelivr/unpkg)
- **Markdown:** `marked` via importmap from CDN
- **Storage:** IndexedDB via direct native `indexedDB` API (no external library)
- **No build tools:** Pure ES modules, no bundler needed
- **Express:** Static file serving only

### Key Decisions

1. **Remove WebSocket and AI proxy** — All inference runs in-browser via WebLLM. The server only serves static files.
2. **WebLLM Web Worker** — WebLLM runs inference in a Web Worker to keep the UI responsive.
3. **Importmap for dependencies** — Use `<script type="importmap">` to map package names to CDN URLs, no npm install needed.

## UI Design

### Layout: Split Panel

**Left Panel (220px width):** Model control and status
- Connection indicator (green = model ready, yellow = loading, red = disconnected/error)
- Model selector dropdown: **Gemma 2B** (default), Gemma 9B (high quality), Gemma 1B (lightweight)
- GPU memory usage display
- Tokens/sec throughput display
- Unload model button
- New conversation button
- **Stop generation button** — shown during streaming, aborts current inference

**Right Panel (flex):** Chat area
- Scrollable message history
- Markdown-rendered AI responses (using `marked` library)
- Input field with send button at bottom
- Input disabled while model is loading

### Model Loading Experience (Option A)
- Progress bar shown in left panel during download
- Chat area shows "Model loading..." overlay, input disabled
- Progress: download percentage + ETA
- After first download, subsequent loads use browser cache (much faster)

## Conversation Persistence

### IndexedDB Storage
- Each conversation stored as a record in IndexedDB
- Schema: `{ id, title, messages: [{role, content, timestamp}], createdAt, updatedAt }`
- Auto-save after each message pair
- On page load, restore the most recent conversation (determined by latest `updatedAt`)
- Conversation `title` is auto-generated from the first user message (first 40 characters)
- New conversation button creates a fresh empty conversation (previous conversations remain in IndexedDB but are not browseable in v1 — they are kept for potential future "conversation history" feature)

## Data Flow

```
User types message → UI renders user bubble → append to messages array
  → engine.chat.completions.create({
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 4096,
      top_p: 0.95,
    })
  → stream tokens one by one → render Markdown in real-time → append to messages array
  → save to IndexedDB

During streaming:
  → Stop button visible in left panel
  → User clicks Stop → AbortController.abort() → engine stops generating
  → Partial response is kept as-is
  → Input field disabled during streaming (no message queuing)
```

## Error Handling

| Error | Handling |
|---|---|
| WebGPU not supported | Show banner: "Your browser does not support WebGPU. Please use Chrome 113+ or Edge 113+." |
| Model download fails | Show error in left panel with "Retry" button |
| Out of GPU memory | Show prompt: "Not enough GPU memory. Try switching to a smaller model." with link to model selector |
| IndexedDB write fails | Silent degradation — conversation continues but won't persist |
| Inference error | Show error message in chat area, allow retry |

## Model Switching

- Dropdown in left panel allows switching between available models
- Switching unloads the current model and loads the new one
- Current conversation context is preserved across model switches
- Model list (data-driven config array for easy updates):
  - Default: `gemma-2-2b-it-q4f16_1-MLC` (~1.5GB, 2B params, ~3GB VRAM recommended)
  - High quality: `gemma-2-9b-it-q4f16_1-MLC` (~5.5GB, 9B params, ~8GB VRAM recommended)
  - Lightweight: `gemma-2-2b-it-q4f16_1-MLC` with lower precision or future smaller models (~800MB, ~2GB VRAM)

## Server Changes

`server/index.js` simplified to:
- Serve static files from `public/`
- Remove WebSocket server
- Remove Anthropic API proxy code
- **Required headers:** All responses must include `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` — these are required by WebLLM for `SharedArrayBuffer` access (WebGPU). Without these headers, inference will fail.
- Keep basic Express static server

## Dependencies (CDN via importmap)

| Package | Purpose |
|---|---|
| `@mlc-ai/web-llm` | WebGPU inference engine |
| `marked` | Markdown rendering |

No npm dependencies needed for the frontend.

## Browser Requirements

- Chrome 113+ or Edge 113+ (WebGPU support)
- GPU with sufficient VRAM: 3GB+ for 2B model, 8GB+ for 9B model
- ~2-6GB disk space for model cache (first load downloads from CDN)
