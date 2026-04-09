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
