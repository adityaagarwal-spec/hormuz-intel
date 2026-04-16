/**
 * chat.js — ARIA chatbot panel for Hormuz Intel Dashboard
 * Connects to /api/chat (Flask + Claude backend)
 */

const ChatModule = (() => {

  // ── State ──────────────────────────────────────────────────
  let isOpen = false;
  let isStreaming = false;
  let conversationHistory = []; // {role, content}[]

  // ── DOM refs ───────────────────────────────────────────────
  let panel, messagesEl, inputEl, sendBtn, toggleBtn;

  // ── Init ───────────────────────────────────────────────────
  function init() {
    panel     = document.getElementById('chat-panel');
    messagesEl = document.getElementById('chat-messages');
    inputEl   = document.getElementById('chat-input');
    sendBtn   = document.getElementById('chat-send');
    toggleBtn = document.getElementById('chat-toggle-btn');

    sendBtn.addEventListener('click', sendMessage);
    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    inputEl.addEventListener('input', () => {
      sendBtn.disabled = !inputEl.value.trim() || isStreaming;
    });

    // Welcome message
    appendMessage('assistant',
      'ARIA online. I have full situational awareness of the current Strait of Hormuz picture — 10 vessels tracked, 12 active signals.\n\nAsk me anything: vessel risk assessments, signal analysis, threat patterns, ADID correlations, or strait-wide summaries.'
    );
  }

  // ── Toggle panel ───────────────────────────────────────────
  function toggle() {
    isOpen = !isOpen;
    panel.classList.toggle('open', isOpen);
    toggleBtn.classList.toggle('active', isOpen);
    if (isOpen) {
      inputEl.focus();
    }
  }

  // ── Send message ───────────────────────────────────────────
  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text || isStreaming) return;

    inputEl.value = '';
    sendBtn.disabled = true;

    // Add user message to history and UI
    conversationHistory.push({ role: 'user', content: text });
    appendMessage('user', text);

    // Streaming response
    isStreaming = true;
    const msgEl = appendMessage('assistant', '', true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: conversationHistory }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setMessageContent(msgEl, `Error: ${err.error || 'Request failed'}`);
        msgEl.classList.add('error');
        isStreaming = false;
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') break;

          try {
            const chunk = JSON.parse(payload);
            if (chunk.error) {
              setMessageContent(msgEl, `Error: ${chunk.error}`);
              msgEl.classList.add('error');
              isStreaming = false;
              return;
            }
            if (chunk.text) {
              fullText += chunk.text;
              setMessageContent(msgEl, fullText, true);
            }
          } catch (_) { /* ignore malformed chunks */ }
        }
      }

      // Save to history
      conversationHistory.push({ role: 'assistant', content: fullText });
      setMessageContent(msgEl, fullText, false); // final render (no cursor)

    } catch (err) {
      setMessageContent(msgEl, `Connection error: ${err.message}`);
      msgEl.classList.add('error');
    } finally {
      isStreaming = false;
      sendBtn.disabled = !inputEl.value.trim();
    }
  }

  // ── UI helpers ─────────────────────────────────────────────
  function appendMessage(role, text, streaming = false) {
    const wrapper = document.createElement('div');
    wrapper.className = `chat-msg chat-msg-${role}`;

    const label = document.createElement('div');
    label.className = 'chat-msg-label';
    label.textContent = role === 'user' ? 'YOU' : 'ARIA';
    wrapper.appendChild(label);

    const bubble = document.createElement('div');
    bubble.className = 'chat-msg-bubble';
    wrapper.appendChild(bubble);

    if (streaming) {
      bubble.innerHTML = '<span class="chat-cursor">▋</span>';
    } else {
      renderMarkdown(bubble, text);
    }

    messagesEl.appendChild(wrapper);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return wrapper;
  }

  function setMessageContent(wrapperEl, text, streaming = false) {
    const bubble = wrapperEl.querySelector('.chat-msg-bubble');
    if (!bubble) return;
    if (streaming) {
      // Render text + blinking cursor
      renderMarkdown(bubble, text);
      const cursor = document.createElement('span');
      cursor.className = 'chat-cursor';
      cursor.textContent = '▋';
      bubble.appendChild(cursor);
    } else {
      renderMarkdown(bubble, text);
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // Minimal markdown: **bold**, `code`, newlines, bullet lists
  function renderMarkdown(el, text) {
    // Escape HTML first
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Code blocks ```...```
    html = html.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) =>
      `<pre class="chat-code">${code.trim()}</pre>`
    );

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>');

    // Bold **text**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Bullet lists (lines starting with - or •)
    html = html.replace(/^[•\-] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/gs, m => `<ul>${m}</ul>`);

    // Newlines to <br> (but not inside pre blocks)
    html = html.replace(/(?<!<\/pre>)\n(?!<pre)/g, '<br>');

    el.innerHTML = html;
  }

  // ── Quick prompts ──────────────────────────────────────────
  function quickPrompt(text) {
    if (!isOpen) toggle();
    inputEl.value = text;
    sendBtn.disabled = false;
    inputEl.focus();
    sendMessage();
  }

  function clearChat() {
    conversationHistory = [];
    messagesEl.innerHTML = '';
    appendMessage('assistant', 'Conversation cleared. ARIA ready.');
  }

  // ── Public API ─────────────────────────────────────────────
  return { init, toggle, quickPrompt, clearChat };

})();

// Boot when DOM ready
document.addEventListener('DOMContentLoaded', () => ChatModule.init());
