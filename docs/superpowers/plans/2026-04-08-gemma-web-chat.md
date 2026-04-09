# Gemma Web Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Claude Web API proxy with a browser-based chat UI that runs Gemma models locally via WebGPU/WebLLM.

**Architecture:** Pure client-side inference. Express server simplified to static file serving with COOP/COEP headers. Frontend uses WebLLM via importmap, native IndexedDB for persistence, and `marked` for Markdown rendering.

**Tech Stack:** Express, `@mlc-ai/web-llm` (CDN), `marked` (CDN), IndexedDB, WebGPU

---

### Task 1: Simplify Server — Remove WebSocket/API Proxy, Add COOP/COEP Headers

**Files:**
- Modify: `server/index.js` (lines 1-139) — replace entire content

- [ ] **Step 1: Replace server/index.js with simplified static server**

Remove all WebSocket, Anthropic API proxy, session management code. Replace with:

```javascript
import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);

// Required headers for WebLLM SharedArrayBuffer access
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

app.use(express.static(join(__dirname, '../public')));

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Gemma Web running at http://localhost:${PORT}`);
});
```

- [ ] **Step 2: Remove `ws` dependency from package.json**

Remove `"ws": "^8.18.0"` from `package.json` dependencies. Run `npm install` to update `package-lock.json`.

- [ ] **Step 3: Verify server starts**

Run: `npm run dev` (then Ctrl+C)
Expected: `Gemma Web running at http://localhost:3000`

- [ ] **Step 4: Commit**

```bash
git add server/index.js package.json package-lock.json
git commit -m "refactor: simplify server to static files, add COOP/COEP headers for WebLLM"
```

---

### Task 2: Create New Frontend Layout — Split Panel UI

**Files:**
- Create: `public/index.html` (complete rewrite of existing file)

- [ ] **Step 1: Write the new index.html**

Replace the existing terminal-style UI with the split panel chat layout. This is the complete HTML with inline CSS and placeholder JS (no WebLLM logic yet):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gemma Web</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #1e1e2e;
      color: #cdd6f4;
      font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
      font-size: 14px;
      line-height: 1.5;
      height: 100vh;
      display: flex;
      overflow: hidden;
    }

    /* Left Panel */
    #sidebar {
      width: 220px;
      min-width: 220px;
      background: #181825;
      border-right: 1px solid #313244;
      display: flex;
      flex-direction: column;
      padding: 12px;
      gap: 12px;
      overflow-y: auto;
    }
    #sidebar .status-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      padding: 4px 8px;
      border-radius: 6px;
    }
    #sidebar .status-indicator.ready { background: #a6e3a1; color: #1e1e2e; }
    #sidebar .status-indicator.loading { background: #f9e2af; color: #1e1e2e; }
    #sidebar .status-indicator.error { background: #f38ba8; color: #1e1e2e; }
    #sidebar .status-indicator.idle { background: #313244; color: #a6adc8; }
    .sidebar-section { border-bottom: 1px solid #313244; padding-bottom: 10px; }
    .sidebar-section:last-child { border-bottom: none; }
    .sidebar-label {
      font-size: 11px;
      color: #6c7086;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    #model-select {
      width: 100%;
      padding: 6px 8px;
      background: #313244;
      color: #cdd6f4;
      border: 1px solid #45475a;
      border-radius: 6px;
      font-family: inherit;
      font-size: 12px;
    }
    .stat-row {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      margin-bottom: 4px;
    }
    .stat-value { color: #a6e3a1; }
    .sidebar-btn {
      width: 100%;
      padding: 6px 10px;
      background: #313244;
      color: #cdd6f4;
      border: none;
      border-radius: 6px;
      font-family: inherit;
      font-size: 12px;
      cursor: pointer;
      margin-bottom: 6px;
    }
    .sidebar-btn:hover { background: #45475a; }
    .sidebar-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .sidebar-btn.danger { background: #f38ba8; color: #1e1e2e; }
    .sidebar-btn.danger:hover { background: #eba0ac; }
    #progress-bar-container { display: none; margin-top: 8px; }
    #progress-bar-container.active { display: block; }
    #progress-bar {
      width: 100%;
      height: 6px;
      background: #313244;
      border-radius: 3px;
      overflow: hidden;
    }
    #progress-bar-fill {
      width: 0%;
      height: 100%;
      background: #89b4fa;
      transition: width 0.3s;
    }
    #progress-text { font-size: 11px; color: #6c7086; margin-top: 4px; }

    /* Right Panel - Chat */
    #chat-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    #chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
    }
    .message {
      margin-bottom: 16px;
      max-width: 80%;
    }
    .message.user { margin-left: auto; }
    .message.assistant { margin-right: auto; }
    .message-bubble {
      padding: 10px 14px;
      border-radius: 12px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .message.user .message-bubble {
      background: #45475a;
      color: #cdd6f4;
      border-bottom-right-radius: 2px;
    }
    .message.assistant .message-bubble {
      background: #1e1e3a;
      color: #cdd6f4;
      border-bottom-left-radius: 2px;
    }
    .message-bubble p { margin-bottom: 8px; }
    .message-bubble p:last-child { margin-bottom: 0; }
    .message-bubble pre {
      background: #181825;
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 8px 0;
    }
    .message-bubble code {
      font-family: inherit;
      background: #313244;
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 13px;
    }
    .message-bubble pre code {
      background: none;
      padding: 0;
    }
    .message-bubble ul, .message-bubble ol { margin-left: 20px; }
    .message-bubble blockquote {
      border-left: 3px solid #89b4fa;
      padding-left: 12px;
      color: #6c7086;
    }

    /* Input Area */
    #input-area {
      display: flex;
      padding: 12px 20px;
      background: #181825;
      border-top: 1px solid #313244;
      gap: 8px;
    }
    #message-input {
      flex: 1;
      padding: 10px 14px;
      background: #313244;
      border: 1px solid #45475a;
      border-radius: 8px;
      color: #cdd6f4;
      font-family: inherit;
      font-size: 14px;
      outline: none;
    }
    #message-input:focus { border-color: #89b4fa; }
    #message-input:disabled { opacity: 0.5; }
    #send-btn {
      padding: 10px 20px;
      background: #89b4fa;
      color: #1e1e2e;
      border: none;
      border-radius: 8px;
      font-family: inherit;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
    }
    #send-btn:hover { background: #74c7ec; }
    #send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Loading Overlay */
    #loading-overlay {
      display: none;
      position: absolute;
      inset: 0;
      background: rgba(30, 30, 46, 0.85);
      justify-content: center;
      align-items: center;
      z-index: 10;
    }
    #loading-overlay.active { display: flex; }
    #loading-overlay-text {
      font-size: 18px;
      color: #89b4fa;
    }

    /* WebGPU Warning */
    #webgpu-warning {
      display: none;
      padding: 12px 20px;
      background: #f38ba8;
      color: #1e1e2e;
      font-size: 13px;
      text-align: center;
    }
    #webgpu-warning.active { display: block; }

    /* Cursor blink */
    .cursor::after {
      content: '▋';
      animation: blink 1s step-end infinite;
      color: #89b4fa;
    }
    @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
  </style>
</head>
<body>
  <div id="sidebar">
    <div id="status-indicator" class="status-indicator idle">Initializing...</div>

    <div class="sidebar-section">
      <div class="sidebar-label">Model</div>
      <select id="model-select"></select>
    </div>

    <div class="sidebar-section">
      <div class="sidebar-label">GPU Memory</div>
      <div class="stat-row">
        <span>Used</span>
        <span class="stat-value" id="gpu-memory">—</span>
      </div>
    </div>

    <div class="sidebar-section">
      <div class="sidebar-label">Performance</div>
      <div class="stat-row">
        <span>Tokens/s</span>
        <span class="stat-value" id="tokens-per-sec">—</span>
      </div>
    </div>

    <div class="sidebar-section">
      <div id="progress-bar-container">
        <div class="sidebar-label">Download</div>
        <div id="progress-bar"><div id="progress-bar-fill"></div></div>
        <div id="progress-text"></div>
      </div>
      <button class="sidebar-btn" id="stop-btn" style="display:none;">Stop Generation</button>
      <button class="sidebar-btn danger" id="unload-btn" style="display:none;">Unload Model</button>
      <button class="sidebar-btn" id="new-conv-btn">New Conversation</button>
    </div>
  </div>

  <div id="chat-panel">
    <div id="webgpu-warning">Your browser does not support WebGPU. Please use Chrome 113+ or Edge 113+.</div>
    <div id="chat-messages"></div>
    <div id="input-area">
      <input id="message-input" type="text" placeholder="Type a message..." autofocus disabled />
      <button id="send-btn" disabled>Send</button>
    </div>
    <div id="loading-overlay"><div id="loading-overlay-text">Loading model...</div></div>
  </div>

  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Verify the page loads**

Run: `npm run dev`, open `http://localhost:3000`
Expected: Split panel layout with sidebar (model selector, stats, buttons) and empty chat area. Input disabled, WebGPU warning hidden.

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat: new split panel chat UI layout"
```

---

### Task 3: Create IndexedDB Store Module

**Files:**
- Create: `public/store.js`

- [ ] **Step 1: Write store.js**

Implement IndexedDB conversation persistence:

```javascript
const DB_NAME = 'gemma-web-chat';
const DB_VERSION = 1;
const STORE_NAME = 'conversations';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveConversation(conv) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(conv);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    // Silent degradation — conversation continues but won't persist
    console.warn('IndexedDB save failed:', e);
  }
}

export async function getLatestConversation() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const index = tx.objectStore(STORE_NAME).index('updatedAt');
      const req = index.openCursor(null, 'prev');
      req.onsuccess = () => {
        const cursor = req.result;
        resolve(cursor ? cursor.value : null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export function createNewConversation() {
  return {
    id: crypto.randomUUID(),
    title: '',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function generateTitle(firstMessage) {
  if (!firstMessage) return 'New conversation';
  return firstMessage.substring(0, 40) + (firstMessage.length > 40 ? '...' : '');
}
```

- [ ] **Step 2: Verify store module loads**

Create a quick test: add `<script type="module">import { createNewConversation } from './store.js'; console.log(createNewConversation());</script>` temporarily to index.html, refresh, check console.

Expected: Logs a new conversation object with UUID, empty messages, timestamps.

- [ ] **Step 3: Commit**

```bash
git add public/store.js
git commit -m "feat: IndexedDB conversation persistence module"
```

---

### Task 4: Create UI Rendering Module

**Files:**
- Create: `public/ui.js`

- [ ] **Step 1: Write ui.js**

Implement chat UI rendering with Markdown support via `marked`:

```javascript
import { marked } from 'marked';

marked.setOptions({
  breaks: true,
  gfm: true,
});

const chatMessages = document.getElementById('chat-messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const loadingOverlay = document.getElementById('loading-overlay');

export function renderUserMessage(text) {
  const div = document.createElement('div');
  div.className = 'message user';
  div.innerHTML = `<div class="message-bubble">${escapeHtml(text)}</div>`;
  chatMessages.appendChild(div);
  scrollToBottom();
}

export function createAssistantBubble() {
  const div = document.createElement('div');
  div.className = 'message assistant';
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble cursor';
  div.appendChild(bubble);
  chatMessages.appendChild(div);
  scrollToBottom();
  return bubble;
}

export function updateAssistantBubble(bubble, text) {
  bubble.innerHTML = marked.parse(text);
  bubble.classList.add('cursor');
  scrollToBottom();
}

export function finalizeAssistantBubble(bubble) {
  bubble.classList.remove('cursor');
}

export function appendError(text) {
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.innerHTML = `<div class="message-bubble" style="background:#452233;color:#f38ba8;">${escapeHtml(text)}</div>`;
  chatMessages.appendChild(div);
  scrollToBottom();
}

export function setInputEnabled(enabled) {
  messageInput.disabled = !enabled;
  sendBtn.disabled = !enabled;
  if (enabled) messageInput.focus();
}

export function setLoadingVisible(visible) {
  loadingOverlay.classList.toggle('active', visible);
}

export function clearChat() {
  chatMessages.innerHTML = '';
}

function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function onSend(callback) {
  sendBtn.addEventListener('click', () => {
    const text = messageInput.value.trim();
    if (!text) return;
    messageInput.value = '';
    callback(text);
  });

  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const text = messageInput.value.trim();
      if (!text) return;
      messageInput.value = '';
      callback(text);
    }
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add public/ui.js
git commit -m "feat: UI rendering module with Markdown support"
```

---

### Task 5: Create WebLLM Engine Module (app.js)

**Files:**
- Create: `public/app.js`
- Modify: `public/index.html` (add `<script type="importmap">`)

- [ ] **Step 1: Add importmap to index.html**

Add this before the `<script type="module" src="app.js"></script>` line in `public/index.html`:

```html
  <script type="importmap">
  {
    "imports": {
      "@mlc-ai/web-llm": "https://esm.run/@mlc-ai/web-llm",
      "marked": "https://esm.run/marked"
    }
  }
  </script>
```

- [ ] **Step 2: Write app.js**

Main orchestrator — WebLLM engine, model loading, chat flow, UI state management:

```javascript
import { CreateMLCEngine } from '@mlc-ai/web-llm';
import { saveConversation, getLatestConversation, createNewConversation, generateTitle } from './store.js';
import {
  renderUserMessage,
  createAssistantBubble,
  updateAssistantBubble,
  finalizeAssistantBubble,
  appendError,
  setInputEnabled,
  setLoadingVisible,
  clearChat,
  onSend,
} from './ui.js';

// Model config
const MODELS = [
  { id: 'gemma-2-2b-it-q4f16_1-MLC', label: 'Gemma 2B (Default)', default: true },
  { id: 'gemma-2-9b-it-q4f16_1-MLC', label: 'Gemma 9B (High Quality)' },
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Llama 1B (Lightweight)' },
];

// Stop tokens vary by model family — keyed by model prefix
const STOP_TOKENS = {
  'gemma-2': ['<end_of_turn>'],
  'Llama-3.2': ['<|eot_id|>'],
};

function getStopTokens(modelId) {
  for (const [prefix, tokens] of Object.entries(STOP_TOKENS)) {
    if (modelId.startsWith(prefix)) return tokens;
  }
  return [];
}

// DOM refs
const statusEl = document.getElementById('status-indicator');
const modelSelect = document.getElementById('model-select');
const gpuMemoryEl = document.getElementById('gpu-memory');
const tokensPerSecEl = document.getElementById('tokens-per-sec');
const progressBarContainer = document.getElementById('progress-bar-container');
const progressBarFill = document.getElementById('progress-bar-fill');
const progressText = document.getElementById('progress-text');
const stopBtn = document.getElementById('stop-btn');
const unloadBtn = document.getElementById('unload-btn');
const newConvBtn = document.getElementById('new-conv-btn');
const webgpuWarning = document.getElementById('webgpu-warning');

// State
let engine = null;
let currentConv = null;
let isGenerating = false;
let stopRequested = false;

// Init
async function init() {
  if (!navigator.gpu) {
    webgpuWarning.classList.add('active');
    setStatus('error', 'WebGPU not supported');
    return;
  }

  // Populate model selector
  MODELS.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.label;
    if (m.default) opt.selected = true;
    modelSelect.appendChild(opt);
  });

  // Restore or create conversation
  const saved = await getLatestConversation();
  currentConv = saved || createNewConversation();

  // Restore chat history
  if (saved && saved.messages.length > 0) {
    for (const msg of saved.messages) {
      if (msg.role === 'user') renderUserMessage(msg.content);
      else if (msg.role === 'assistant') {
        const bubble = createAssistantBubble();
        updateAssistantBubble(bubble, msg.content);
        finalizeAssistantBubble(bubble);
      }
    }
  }

  setStatus('idle', 'Ready to load model');
  setInputEnabled(false);

  // Auto-load default model
  await loadModel();

  // Event listeners
  modelSelect.addEventListener('change', onModelChange);
  stopBtn.addEventListener('click', onStopGeneration);
  unloadBtn.addEventListener('click', onUnloadModel);
  newConvBtn.addEventListener('click', onNewConversation);

  onSend(onUserMessage);
}

async function onModelChange() {
  if (isGenerating) return;
  await unloadModel();
  await loadModel();
}

async function loadModel() {
  const modelId = modelSelect.value;
  const modelConfig = MODELS.find(m => m.id === modelId);
  if (!modelConfig) return;

  setStatus('loading', 'Loading model...');
  setLoadingVisible(true);
  progressBarContainer.classList.add('active');
  progressBarFill.style.width = '0%';
  progressText.textContent = 'Downloading...';

  try {
    engine = await CreateMLCEngine(modelId, {
      initProgressCallback: (report) => {
        const pct = Math.round(report.progress * 100);
        progressBarFill.style.width = `${pct}%`;
        progressText.textContent = `${pct}% — ${report.text}`;
      },
    });
    // Note: CreateMLCEngine is a factory function (no `new`). If the installed
    // WebLLM version requires `new CreateMLCEngine(...)`, adjust accordingly.

    setLoadingVisible(false);
    progressBarContainer.classList.remove('active');
    setStatus('ready', `Model ready: ${modelConfig.label}`);
    setInputEnabled(true);
    unloadBtn.style.display = 'block';
    updateMetrics();
  } catch (err) {
    setLoadingVisible(false);
    progressBarContainer.classList.remove('active');
    setStatus('error', 'Model load failed');
    appendError(`Failed to load model: ${err.message}`);
    // Show retry button
    const retryBtn = document.createElement('button');
    retryBtn.className = 'sidebar-btn';
    retryBtn.textContent = 'Retry';
    retryBtn.style.marginTop = '6px';
    retryBtn.onclick = () => { retryBtn.remove(); loadModel(); };
    document.querySelector('.sidebar-section:last-child').appendChild(retryBtn);
    console.error(err);
  }
}

async function unloadModel() {
  if (engine) {
    // WebLLM may use engine.unload(), engine.terminate(), or engine.dispose()
    // depending on version. Verify at implementation time.
    await engine.unload().catch(() => engine.terminate?.());
    engine = null;
  }
  unloadBtn.style.display = 'none';
  setInputEnabled(false);
  setStatus('idle', 'Model unloaded');
}

async function onUserMessage(text) {
  if (!engine || isGenerating) return;

  isGenerating = true;
  stopBtn.style.display = 'block';
  setInputEnabled(false);

  // Render user message
  renderUserMessage(text);

  // Build messages array
  currentConv.messages.push({ role: 'user', content: text, timestamp: Date.now() });

  // Generate title from first message
  if (currentConv.messages.length === 1) {
    currentConv.title = generateTitle(text);
  }

  // Create assistant bubble
  const bubble = createAssistantBubble();
  let fullResponse = '';
  stopRequested = false;

  try {
    const stream = engine.chat.completions.create({
      messages: currentConv.messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 4096,
      top_p: 0.95,
      stop: getStopTokens(modelSelect.value),
    });

    for await (const chunk of stream) {
      if (stopRequested) {
        // Interrupt the engine on stop request
        await engine.interrupt().catch(() => {});
        break;
      }
      const delta = chunk.choices[0]?.delta?.content || '';
      fullResponse += delta;
      updateAssistantBubble(bubble, fullResponse);
    }

    if (fullResponse) {
      currentConv.messages.push({ role: 'assistant', content: fullResponse, timestamp: Date.now() });
      currentConv.updatedAt = Date.now();
      await saveConversation(currentConv);
    }
  } catch (err) {
    if (!stopRequested) {
      appendError(`Generation error: ${err.message}`);
      console.error(err);
    }
  }

  finalizeAssistantBubble(bubble);
  isGenerating = false;
  stopRequested = false;
  stopBtn.style.display = 'none';
  setInputEnabled(true);
}

async function onStopGeneration() {
  stopRequested = true;
}

function setStatus(state, text) {
  statusEl.className = `status-indicator ${state}`;
  statusEl.textContent = text;
}

// Update GPU memory and tokens/sec from engine runtime stats
// WebLLM exposes engine.runtimeStatsText or similar — verify at implementation time
function updateMetrics() {
  if (!engine) {
    gpuMemoryEl.textContent = '—';
    tokensPerSecEl.textContent = '—';
    return;
  }
  // Poll metrics every 2s while generating
  const interval = setInterval(() => {
    if (!engine || !isGenerating) { clearInterval(interval); return; }
    try {
      const stats = engine.runtimeStatsText;
      if (stats) {
        // Parse from runtime stats if available, otherwise show placeholders
        gpuMemoryEl.textContent = stats.memory || '—';
        tokensPerSecEl.textContent = stats.tok_per_sec || '—';
      }
    } catch {}
  }, 2000);
}

async function onNewConversation() {
  if (isGenerating) return;
  currentConv = createNewConversation();
  clearChat();
  setInputEnabled(!!engine);
}

async function onUnloadModel() {
  await unloadModel();
}

// Start
init().catch(console.error);
```

- [ ] **Step 3: Commit**

```bash
git add public/index.html public/app.js
git commit -m "feat: WebLLM engine integration with importmap"
```

---

### Task 6: Integration Testing and Polish

**Files:**
- No new files

- [ ] **Step 1: Full integration test**

Run: `npm run dev`, open `http://localhost:3000` in Chrome 113+.

Verify:
1. Page loads with split panel layout
2. Model downloads from CDN (progress bar visible)
3. After model loads, input is enabled
4. Send a message → user bubble appears → AI streams response
5. Markdown renders correctly (try: `**bold**`, ```code blocks```, lists)
6. Stop button works during streaming
7. Unload model → input disabled
8. New conversation → chat clears
9. Page refresh → conversation restored from IndexedDB
10. Model selector switches models

- [ ] **Step 2: Fix any issues found**

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "polish: integration testing and bug fixes"
```
