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

// System prompt presets
const PROMPT_PRESETS = {
  'english-tutor': 'You are an English language tutor. Only respond in English. Correct my grammar mistakes and help me practice.',
  'code-reviewer': 'You are a code reviewer. Analyze code for bugs, security issues, and suggest improvements. Be concise and direct.',
  'translator': 'You are a professional translator. Translate between languages accurately while preserving tone and context.',
};

// DOM refs
const statusEl = document.getElementById('status-indicator');
const modelSelect = document.getElementById('model-select');
const promptPresets = document.getElementById('prompt-presets');
const systemPromptEl = document.getElementById('system-prompt');
const savePromptBtn = document.getElementById('save-prompt-btn');
const gpuMemoryEl = document.getElementById('gpu-memory');
const tokensPerSecEl = document.getElementById('tokens-per-sec');
const progressBarContainer = document.getElementById('progress-bar-container');
const progressBarFill = document.getElementById('progress-bar-fill');
const progressText = document.getElementById('progress-text');
const stopBtn = document.getElementById('stop-btn');
const unloadBtn = document.getElementById('unload-btn');
const newConvBtn = document.getElementById('new-conv-btn');
const webgpuWarning = document.getElementById('webgpu-warning');
const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const headerStatusEl = document.getElementById('header-status');
const mobileProgress = document.getElementById('mobile-progress');
const mpFill = document.getElementById('mp-fill');
const mpText = document.getElementById('mp-text');

// State
let engine = null;
let currentConv = null;
let isGenerating = false;
let stopRequested = false;
let metricsInterval = null;

// Init
async function init() {
  if (!navigator.gpu) {
    webgpuWarning.classList.add('active');
    if (headerStatusEl) {
      headerStatusEl.className = 'error';
      headerStatusEl.textContent = 'WebGPU 不可用';
    }
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

  // Load saved system prompt
  const savedPrompt = localStorage.getItem('gemma-system-prompt');
  if (savedPrompt) {
    systemPromptEl.value = savedPrompt;
  }

  // Auto-load default model
  await loadModel();

  // Event listeners
  modelSelect.addEventListener('change', onModelChange);
  stopBtn.addEventListener('click', onStopGeneration);
  unloadBtn.addEventListener('click', onUnloadModel);
  newConvBtn.addEventListener('click', onNewConversation);
  promptPresets.addEventListener('change', onPresetChange);
  savePromptBtn.addEventListener('click', onSavePrompt);

  onSend(onUserMessage);

  // Sidebar toggle (mobile)
  sidebarToggleBtn.addEventListener('click', toggleSidebar);
  sidebarOverlay.addEventListener('click', toggleSidebar);
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const isDesktop = window.innerWidth > 768;
  if (isDesktop) return;
  sidebar.classList.toggle('open');
  sidebarOverlay.classList.toggle('active');
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
  mobileProgress.classList.add('active');
  progressBarFill.style.width = '0%';
  mpFill.style.width = '0%';
  progressText.textContent = 'Downloading...';
  mpText.textContent = 'Downloading...';

  try {
    const loadPromise = CreateMLCEngine(modelId, {
      initProgressCallback: (report) => {
        const pct = Math.round(report.progress * 100);
        progressBarFill.style.width = `${pct}%`;
        mpFill.style.width = `${pct}%`;
        progressText.textContent = `${pct}% — ${report.text}`;
        mpText.textContent = `${pct}% — ${report.text}`;
      },
    });

    // Timeout after 60s — likely no real WebGPU support
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Load timeout — WebGPU may not be supported')), 60000)
    );

    engine = await Promise.race([loadPromise, timeout]);

    setLoadingVisible(false);
    progressBarContainer.classList.remove('active');
    mobileProgress.classList.remove('active');
    setStatus('ready', `Model ready: ${modelConfig.label}`);
    setInputEnabled(true);
    unloadBtn.style.display = 'block';
    startMetricsPolling();
  } catch (err) {
    setLoadingVisible(false);
    progressBarContainer.classList.remove('active');
    mobileProgress.classList.remove('active');
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
  stopMetricsPolling();
  if (engine) {
    try {
      await engine.unload();
    } catch {
      try {
        await engine.terminate?.();
      } catch {
        // Best effort cleanup
      }
    }
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

  // Build messages array with system prompt
  const messages = [];
  const sysPrompt = systemPromptEl.value.trim();
  if (sysPrompt) {
    messages.push({ role: 'system', content: sysPrompt });
  }
  messages.push(...currentConv.messages);

  // Generate title from first message
  if (currentConv.messages.length === 1) {
    currentConv.title = generateTitle(text);
  }

  // Create assistant bubble
  const bubble = createAssistantBubble();
  let fullResponse = '';
  stopRequested = false;

  try {
    const stream = await engine.chat.completions.create({
      messages: messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 4096,
      top_p: 0.95,
      stop: getStopTokens(modelSelect.value),
    });

    for await (const chunk of stream) {
      if (stopRequested) {
        try {
          await engine.interrupt();
        } catch {
          // Best effort
        }
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
  if (headerStatusEl) {
    headerStatusEl.className = state;
    headerStatusEl.textContent = text;
  }
}

function startMetricsPolling() {
  stopMetricsPolling();
  metricsInterval = setInterval(() => {
    if (!engine || !isGenerating) return;
    try {
      // WebLLM runtime stats — parse if available
      if (engine.runtimeStatsText) {
        const text = engine.runtimeStatsText;
        const tokMatch = text.match(/(\d+\.?\d*)\s*tok\/s/);
        const memMatch = text.match(/(\d+\.?\d*)\s*(MB|GB)/i);
        if (tokMatch) tokensPerSecEl.textContent = `${tokMatch[1]} tok/s`;
        if (memMatch) gpuMemoryEl.textContent = `${memMatch[1]} ${memMatch[2]}`;
      }
    } catch {}
  }, 2000);
}

function stopMetricsPolling() {
  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
  }
  gpuMemoryEl.textContent = '—';
  tokensPerSecEl.textContent = '—';
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

function onPresetChange() {
  const presetKey = promptPresets.value;
  if (presetKey && PROMPT_PRESETS[presetKey]) {
    systemPromptEl.value = PROMPT_PRESETS[presetKey];
  }
}

function onSavePrompt() {
  const value = systemPromptEl.value.trim();
  if (value) {
    localStorage.setItem('gemma-system-prompt', value);
    savePromptBtn.textContent = 'Saved!';
    setTimeout(() => { savePromptBtn.textContent = 'Save'; }, 1500);
  } else {
    localStorage.removeItem('gemma-system-prompt');
    savePromptBtn.textContent = 'Cleared';
    setTimeout(() => { savePromptBtn.textContent = 'Save'; }, 1500);
  }
}

// Start
init().catch(console.error);
