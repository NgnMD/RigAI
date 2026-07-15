import { marked } from 'marked';
import hljs from 'highlight.js';

// Setup marked custom renderer for premium code block style with copy button
const renderer = new marked.Renderer();
renderer.code = (code, language) => {
  const cleanCode = typeof code === 'object' ? code.text : code;
  const lang = language || 'txt';
  let highlighted;
  try {
    if (lang && hljs.getLanguage(lang)) {
      highlighted = hljs.highlight(cleanCode, { language: lang }).value;
    } else {
      highlighted = hljs.highlightAuto(cleanCode).value;
    }
  } catch (err) {
    highlighted = cleanCode;
  }

  // Escape single quotes for inline JS safety
  const escapedCode = cleanCode
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');

  return `
    <div class="codeblock-wrapper">
      <div class="codeblock-header">
        <span class="code-lang">${lang}</span>
        <button class="copy-code-btn" onclick="window.copyToClipboard('${escapedCode}')">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          Sao chép
        </button>
      </div>
      <pre><code class="hljs ${lang}">${highlighted}</code></pre>
    </div>
  `;
};

marked.use({
  renderer: renderer,
  breaks: true,
  gfm: true
});

// App State
const state = {
  apiKey: localStorage.getItem('rigai_api_key') || '',
  apiUrl: localStorage.getItem('rigai_api_url') || 'https://rim8kde.abc-tunnel.us/v1',
  activeModel: localStorage.getItem('rigai_active_model') || 'gpt-4o',
  systemPrompt: localStorage.getItem('rigai_system_prompt') || 'Bạn là RigAI, một trợ lý thông minh nhân tạo mạnh mẽ, thân thiện, và chính xác. Trả lời bằng tiếng Việt một cách rõ ràng, chi tiết nhưng súc tích, định dạng Markdown đẹp mắt khi cần.',
  temperature: parseFloat(localStorage.getItem('rigai_temperature')) || 0.7,
  maxTokens: parseInt(localStorage.getItem('rigai_max_tokens')) || 2048,
  conversations: JSON.parse(localStorage.getItem('rigai_conversations')) || [],
  activeConversationId: 'new', // 'new' or UUID/Timestamp
  favorites: JSON.parse(localStorage.getItem('rigai_favorites')) || [],
  isThinking: false
};

// DOM Elements
const elements = {
  chatInput: document.getElementById('chat-input'),
  sendBtn: document.getElementById('send-btn'),
  clearBtn: document.getElementById('clear-btn'),
  newChatBtn: document.getElementById('new-chat-btn'),
  historyList: document.getElementById('history-list'),
  modelSelect: document.getElementById('model-select'),
  customModelInput: document.getElementById('custom-model-input'),
  statusCurrentModel: document.getElementById('status-current-model'),
  statusState: document.getElementById('status-state'),
  activeChatTitle: document.getElementById('active-chat-title'),
  tabBtns: document.querySelectorAll('.tab-btn'),
  tabContents: document.querySelectorAll('.tab-content'),
  chatMessages: document.getElementById('chat-messages'),
  apiKeyWarning: document.getElementById('api-key-warning'),
  goToConfigBtn: document.getElementById('go-to-config-btn'),
  apiUrlInput: document.getElementById('api-url-input'),
  apiKeyInput: document.getElementById('api-key-input'),
  toggleApiKey: document.getElementById('toggle-api-key'),
  temperatureInput: document.getElementById('temperature-input'),
  tempVal: document.getElementById('temp-val'),
  maxTokensInput: document.getElementById('max-tokens-input'),
  tokensVal: document.getElementById('tokens-val'),
  saveConfigBtn: document.getElementById('save-config-btn'),
  favoritesList: document.getElementById('favorites-list'),
  settingsToggleBtn: document.getElementById('settings-toggle-btn'),
  settingsPanel: document.getElementById('settings-panel'),
  settingsCloseBtn: document.getElementById('settings-close-btn'),
  toast: document.getElementById('toast')
};

// Global Toast and Copy Helper (Attached to window for inline HTML onclick attributes)
window.showToast = function(message, type = 'success') {
  elements.toast.textContent = message;
  elements.toast.className = `toast show ${type}`;
  setTimeout(() => {
    elements.toast.classList.remove('show');
  }, 3000);
};

window.copyToClipboard = function(text) {
  navigator.clipboard.writeText(text).then(() => {
    window.showToast('Đã sao chép vào bộ nhớ tạm!');
  }).catch(() => {
    window.showToast('Lỗi khi sao chép!', 'error');
  });
};

window.toggleFavorite = function(messageId, convoId) {
  const convo = state.conversations.find(c => c.id == convoId);
  if (!convo) return;
  const msgIndex = convo.messages.findIndex(m => m.id === messageId);
  if (msgIndex === -1) return;
  
  const msg = convo.messages[msgIndex];
  const favIndex = state.favorites.findIndex(f => f.id === messageId);
  
  if (favIndex === -1) {
    // Add to favorites
    const newFav = {
      id: messageId,
      prompt: convo.messages[msgIndex - 1]?.text || 'Câu hỏi của người dùng',
      response: msg.text,
      model: convo.model,
      timestamp: msg.timestamp
    };
    state.favorites.push(newFav);
    window.showToast('Đã thêm vào danh sách yêu thích!');
  } else {
    // Remove from favorites
    state.favorites.splice(favIndex, 1);
    window.showToast('Đã xóa khỏi danh sách yêu thích!');
  }
  
  localStorage.setItem('rigai_favorites', JSON.stringify(state.favorites));
  renderFavorites();
  renderConversation();
};

window.deleteFavoriteCard = function(favId) {
  state.favorites = state.favorites.filter(f => f.id !== favId);
  localStorage.setItem('rigai_favorites', JSON.stringify(state.favorites));
  window.showToast('Đã xóa khỏi danh sách yêu thích!');
  renderFavorites();
  renderConversation();
};

// App Initialization
function init() {
  checkApiKeyStatus();
  loadConfigToUI();
  renderHistory();
  renderConversation();
  renderFavorites();
  setupEventListeners();
  updateStatusPanel();
}

// Check API Key & Show Banner
function checkApiKeyStatus() {
  if (!state.apiKey) {
    elements.apiKeyWarning.classList.remove('hidden');
  } else {
    elements.apiKeyWarning.classList.add('hidden');
  }
}

// Load configurations to Inputs
function loadConfigToUI() {
  elements.apiUrlInput.value = state.apiUrl;
  elements.apiKeyInput.value = state.apiKey;
  elements.temperatureInput.value = state.temperature;
  elements.tempVal.textContent = state.temperature;
  elements.maxTokensInput.value = state.maxTokens;
  elements.tokensVal.textContent = state.maxTokens;
  
  const standardModels = ['gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet', 'gemini-2.0-flash'];
  if (standardModels.includes(state.activeModel)) {
    elements.modelSelect.value = state.activeModel;
    elements.customModelInput.classList.add('hidden');
  } else {
    elements.modelSelect.value = 'custom';
    elements.customModelInput.classList.remove('hidden');
    elements.customModelInput.value = state.activeModel;
  }
}

// Render Sidebar Chat History Items
function renderHistory() {
  elements.historyList.innerHTML = '';
  
  if (state.conversations.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'empty-state';
    emptyMsg.style.padding = '20px 10px';
    emptyMsg.style.fontSize = '12px';
    emptyMsg.textContent = 'Chưa có cuộc trò chuyện nào';
    elements.historyList.appendChild(emptyMsg);
    return;
  }
  
  state.conversations.forEach(convo => {
    const isActive = convo.id == state.activeConversationId;
    const item = document.createElement('div');
    item.className = `history-item ${isActive ? 'active' : ''}`;
    item.dataset.id = convo.id;
    
    item.innerHTML = `
      <div class="history-item-title" title="${convo.title}">${convo.title}</div>
      <button class="delete-item-btn" title="Xóa cuộc trò chuyện">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    `;
    
    // Click listener to load conversation
    item.addEventListener('click', (e) => {
      if (e.target.closest('.delete-item-btn')) return;
      state.activeConversationId = convo.id;
      switchTab('conversation');
      renderConversation();
      updateStatusPanel();
      renderHistory();
    });
    
    // Click listener to delete conversation
    item.querySelector('.delete-item-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Bạn có chắc chắn muốn xóa cuộc trò chuyện này?')) {
        state.conversations = state.conversations.filter(c => c.id != convo.id);
        localStorage.setItem('rigai_conversations', JSON.stringify(state.conversations));
        if (state.activeConversationId == convo.id) {
          state.activeConversationId = 'new';
        }
        renderConversation();
        updateStatusPanel();
        renderHistory();
        window.showToast('Đã xóa cuộc trò chuyện.');
      }
    });
    
    elements.historyList.appendChild(item);
  });
}

// Update Status Panel and Title Text
function updateStatusPanel() {
  const currentConvo = state.conversations.find(c => c.id == state.activeConversationId);
  const modelName = currentConvo ? currentConvo.model : state.activeModel;
  
  elements.statusCurrentModel.textContent = modelName;
  elements.activeChatTitle.textContent = currentConvo ? currentConvo.title : 'Hội thoại mới';
  
  const standardModels = ['gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet', 'gemini-2.0-flash'];
  if (standardModels.includes(modelName)) {
    elements.modelSelect.value = modelName;
    elements.customModelInput.classList.add('hidden');
  } else {
    elements.modelSelect.value = 'custom';
    elements.customModelInput.classList.remove('hidden');
    elements.customModelInput.value = modelName;
  }
  
  if (state.isThinking) {
    elements.statusState.textContent = 'Đang xử lý...';
    elements.statusState.className = 'status-state text-yellow';
    document.querySelector('#clear-btn svg').classList.add('spinning');
  } else {
    elements.statusState.textContent = 'Sẵn sàng';
    elements.statusState.className = 'status-state';
    document.querySelector('#clear-btn svg').classList.remove('spinning');
  }
}

// Switch Tabs
function switchTab(tabId) {
  elements.tabBtns.forEach(btn => {
    if (btn.dataset.tab === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  elements.tabContents.forEach(content => {
    if (content.id === `tab-${tabId}`) {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });
}

// Render Conversation Messages
function renderConversation() {
  const currentConvo = state.conversations.find(c => c.id == state.activeConversationId);
  
  if (!currentConvo || currentConvo.messages.length === 0) {
    // Show Welcome Screen
    elements.chatMessages.innerHTML = `
      <div class="welcome-screen">
        <div class="welcome-header">
          <h2>Chào bạn, tôi là RigAI</h2>
          <p>Một trợ lý AI mạnh mẽ, giao diện tối giản như Gemini. Tôi có thể giúp gì cho bạn hôm nay?</p>
        </div>
        <div class="quick-prompts">
          <button class="prompt-card" data-prompt="Viết một bài thơ ngắn mô tả vẻ đẹp của lập trình web nghệ thuật.">
            <span class="card-icon">✍️</span>
            <span class="card-text">Viết thơ lập trình</span>
          </button>
          <button class="prompt-card" data-prompt="Hãy giải thích lý thuyết lượng tử (quantum physics) một cách dễ hiểu cho học sinh lớp 5.">
            <span class="card-icon">🔬</span>
            <span class="card-text">Giải thích vật lý lượng tử</span>
          </button>
          <button class="prompt-card" data-prompt="Viết một đoạn code Javascript tạo ra hiệu ứng ma trận (matrix waterfall code) trên canvas.">
            <span class="card-icon">💻</span>
            <span class="card-text">Hiệu ứng Matrix JS</span>
          </button>
          <button class="prompt-card" data-prompt="Lập danh sách 5 mẹo giúp cải thiện kỹ năng tối ưu hóa CSS cho giao diện mượt mà.">
            <span class="card-icon">⚡</span>
            <span class="card-text">Tối ưu hiệu năng CSS</span>
          </button>
        </div>
      </div>
    `;
    
    // Add click listeners to welcome quick cards
    document.querySelectorAll('.prompt-card').forEach(card => {
      card.addEventListener('click', () => {
        elements.chatInput.value = card.dataset.prompt;
        sendMessage();
      });
    });
    return;
  }
  
  elements.chatMessages.innerHTML = '';
  
  currentConvo.messages.forEach(msg => {
    const isUser = msg.role === 'user';
    const wrapper = document.createElement('div');
    wrapper.className = `message-bubble-wrapper ${isUser ? 'user' : 'assistant'}`;
    
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    
    if (isUser) {
      bubble.textContent = msg.text;
    } else {
      bubble.innerHTML = marked.parse(msg.text);
      
      // Actions container for assistant messages
      const isFav = state.favorites.some(f => f.id === msg.id);
      const actionHtml = `
        <div class="message-actions">
          <button class="msg-action-btn ${isFav ? 'active' : ''}" onclick="window.toggleFavorite('${msg.id}', '${currentConvo.id}')" title="${isFav ? 'Xóa khỏi yêu thích' : 'Lưu làm yêu thích'}">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </button>
          <button class="msg-action-btn" onclick="window.copyToClipboard('${msg.text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}')" title="Sao chép nội dung">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
          <span class="msg-timestamp">${new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
        </div>
      `;
      bubble.insertAdjacentHTML('beforeend', actionHtml);
    }
    
    wrapper.appendChild(bubble);
    elements.chatMessages.appendChild(wrapper);
  });
  
  scrollToBottom();
}

// Render Favorites Tab Content
function renderFavorites() {
  if (state.favorites.length === 0) {
    elements.favoritesList.innerHTML = '<p class="empty-state">Chưa có câu trả lời yêu thích nào được lưu lại.</p>';
    return;
  }
  
  elements.favoritesList.innerHTML = '';
  
  state.favorites.forEach(fav => {
    const card = document.createElement('div');
    card.className = 'fav-card';
    
    const formattedText = marked.parse(fav.response);
    
    card.innerHTML = `
      <div class="fav-card-header">
        <div class="fav-meta">Model: <strong>${fav.model}</strong> • ${new Date(fav.timestamp).toLocaleString()}</div>
        <div class="fav-actions">
          <button class="msg-action-btn" onclick="window.copyToClipboard(\`${fav.response.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)" title="Sao chép câu trả lời">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
          <button class="msg-action-btn active" onclick="window.deleteFavoriteCard('${fav.id}')" title="Xóa khỏi yêu thích">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </button>
        </div>
      </div>
      <div class="fav-prompt" style="font-size:12px; color:var(--text-secondary); margin-bottom:8px; font-style:italic;">Hỏi: "${fav.prompt}"</div>
      <div class="fav-body">${formattedText}</div>
    `;
    
    elements.favoritesList.appendChild(card);
  });
}

// Scroll to bottom of chat messages
function scrollToBottom() {
  const container = document.getElementById('tab-conversation');
  container.scrollTop = container.scrollHeight;
}

// Send Message logic
async function sendMessage() {
  const text = elements.chatInput.value.trim();
  if (!text || state.isThinking) return;
  
  if (!state.apiKey) {
    window.showToast('Vui lòng thiết lập API Key trước!', 'error');
    elements.settingsPanel.classList.remove('hidden');
    elements.apiKeyInput.focus();
    return;
  }
  
  let currentConvo = state.conversations.find(c => c.id == state.activeConversationId);
  
  // If new conversation, create it
  if (state.activeConversationId === 'new') {
    const newConvoId = Date.now().toString();
    currentConvo = {
      id: newConvoId,
      title: text.substring(0, 24) + (text.length > 24 ? '...' : ''),
      messages: [],
      model: state.activeModel,
      systemPrompt: state.systemPrompt,
      temperature: state.temperature,
      maxTokens: state.maxTokens
    };
    state.conversations.unshift(currentConvo); // Put new chats on top
    state.activeConversationId = newConvoId;
    
    // Save to localstorage first
    localStorage.setItem('rigai_conversations', JSON.stringify(state.conversations));
    
    // Re-render sidebar history list
    renderHistory();
  }
  
  // Add user message
  const userMsgId = 'msg-' + Date.now() + '-user';
  currentConvo.messages.push({
    id: userMsgId,
    role: 'user',
    text: text,
    timestamp: Date.now()
  });
  
  elements.chatInput.value = '';
  renderConversation();
  
  // Update state to thinking
  state.isThinking = true;
  updateStatusPanel();
  
  // Render loading bubble
  const loaderWrapper = document.createElement('div');
  loaderWrapper.className = 'message-bubble-wrapper assistant loader-bubble-wrapper';
  loaderWrapper.innerHTML = `
    <div class="message-bubble" style="display:flex; align-items:center; gap:8px;">
      <span style="color:var(--text-secondary)">RigAI đang suy nghĩ</span>
      <div style="display:flex; gap:4px; margin-top:2px;">
        <span class="thinking-dot" style="width:5px; height:5px; border-radius:50%; background:var(--cyan); animation: pulse 1.2s infinite 0s;"></span>
        <span class="thinking-dot" style="width:5px; height:5px; border-radius:50%; background:var(--cyan); animation: pulse 1.2s infinite 0.2s;"></span>
        <span class="thinking-dot" style="width:5px; height:5px; border-radius:50%; background:var(--cyan); animation: pulse 1.2s infinite 0.4s;"></span>
      </div>
    </div>
  `;
  // Add CSS keyframe for pulse inline if not in style.css
  if (!document.getElementById('pulse-animation')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'pulse-animation';
    styleEl.innerHTML = `
      @keyframes pulse {
        0%, 100% { opacity: 0.3; transform: scale(0.8); }
        50% { opacity: 1; transform: scale(1.2); }
      }
    `;
    document.head.appendChild(styleEl);
  }
  
  elements.chatMessages.appendChild(loaderWrapper);
  scrollToBottom();
  
  try {
    // Format payload for OpenAI-compatible API
    const requestBody = {
      model: currentConvo.model,
      messages: [
        ...(currentConvo.systemPrompt ? [{ role: 'system', content: currentConvo.systemPrompt }] : []),
        ...currentConvo.messages.map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.text
        }))
      ],
      temperature: currentConvo.temperature,
      max_tokens: currentConvo.maxTokens
    };
    
    const apiEndpoint = `${state.apiUrl}/chat/completions`;
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'HTTP-Referer': window.location.origin || 'http://localhost:3000',
      'X-Title': 'RigAI'
    };
    if (state.apiKey) {
      headers['Authorization'] = `Bearer ${state.apiKey}`;
    }
    
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });
    
    // Remove loading bubble
    const loader = elements.chatMessages.querySelector('.loader-bubble-wrapper');
    if (loader) loader.remove();
    
    const responseText = await response.text();
    let resJson;
    
    if (!response.ok) {
      try {
        const errorData = JSON.parse(responseText);
        throw new Error(errorData.error?.message || `API Error (HTTP ${response.status})`);
      } catch (e) {
        throw new Error(e.message.startsWith('API Error') ? e.message : `API Error (HTTP ${response.status}): ${responseText.substring(0, 150)}`);
      }
    }
    
    try {
      resJson = JSON.parse(responseText);
    } catch (parseError) {
      // Robust JSON extraction for tunnels that append HTML scripts/footers
      const firstBrace = responseText.indexOf('{');
      const lastBrace = responseText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const jsonStr = responseText.substring(firstBrace, lastBrace + 1);
        try {
          resJson = JSON.parse(jsonStr);
        } catch (innerError) {
          throw new Error(`Lỗi cú pháp phản hồi từ máy chủ: ${parseError.message}`);
        }
      } else {
        throw new Error(`Phản hồi từ máy chủ không phải JSON hợp lệ: ${responseText.substring(0, 150)}`);
      }
    }
    
    if (!resJson.choices || resJson.choices.length === 0 || !resJson.choices[0].message) {
      throw new Error('API không trả về câu trả lời hợp lệ.');
    }
    
    const replyText = resJson.choices[0].message.content;
    
    // Append AI reply
    const assistantMsgId = 'msg-' + Date.now() + '-assistant';
    currentConvo.messages.push({
      id: assistantMsgId,
      role: 'assistant',
      text: replyText,
      timestamp: Date.now()
    });
    
  } catch (error) {
    console.error(error);
    const loader = elements.chatMessages.querySelector('.loader-bubble-wrapper');
    if (loader) loader.remove();
    
    // Append error bubble
    currentConvo.messages.push({
      id: 'msg-' + Date.now() + '-error',
      role: 'assistant',
      text: `❌ **Đã xảy ra lỗi khi gọi API:**\n\n${error.message}\n\n*Vui lòng kiểm tra lại đường dẫn API, API key hoặc kết nối Internet của bạn.*`,
      timestamp: Date.now()
    });
    
    window.showToast('Gặp lỗi khi kết nối API!', 'error');
  } finally {
    state.isThinking = false;
    localStorage.setItem('rigai_conversations', JSON.stringify(state.conversations));
    renderConversation();
    updateStatusPanel();
  }
}

// Event Listeners Configuration
function setupEventListeners() {
  // Tab navigation triggers
  elements.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });
  
  elements.goToConfigBtn.addEventListener('click', () => {
    elements.settingsPanel.classList.remove('hidden');
  });
  
  // Settings Panel toggles
  elements.settingsToggleBtn.addEventListener('click', () => {
    elements.settingsPanel.classList.toggle('hidden');
  });
  
  elements.settingsCloseBtn.addEventListener('click', () => {
    elements.settingsPanel.classList.add('hidden');
  });
  
  // Model Select changes (updates status panel and changes active convo parameters)
  elements.modelSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'custom') {
      elements.customModelInput.classList.remove('hidden');
      elements.customModelInput.focus();
      state.activeModel = elements.customModelInput.value.trim() || 'custom-model';
    } else {
      elements.customModelInput.classList.add('hidden');
      state.activeModel = val;
    }
    
    localStorage.setItem('rigai_active_model', state.activeModel);
    
    const currentConvo = state.conversations.find(c => c.id == state.activeConversationId);
    if (currentConvo) {
      currentConvo.model = state.activeModel;
      localStorage.setItem('rigai_conversations', JSON.stringify(state.conversations));
    }
    updateStatusPanel();
  });

  // Custom Model Input changes
  elements.customModelInput.addEventListener('input', (e) => {
    const val = e.target.value.trim() || 'custom-model';
    state.activeModel = val;
    localStorage.setItem('rigai_active_model', val);
    
    const currentConvo = state.conversations.find(c => c.id == state.activeConversationId);
    if (currentConvo) {
      currentConvo.model = val;
      localStorage.setItem('rigai_conversations', JSON.stringify(state.conversations));
    }
    updateStatusPanel();
  });
  
  // Send buttons
  elements.sendBtn.addEventListener('click', sendMessage);
  
  elements.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });
  
  // Start New Chat Conversation
  elements.newChatBtn.addEventListener('click', () => {
    if (state.isThinking) return;
    
    state.activeConversationId = 'new';
    renderConversation();
    updateStatusPanel();
    renderHistory();
    window.showToast('Bắt đầu cuộc trò chuyện mới!');
  });
  
  // Clear Current Active Conversation chat messages
  elements.clearBtn.addEventListener('click', () => {
    if (state.isThinking) return;
    
    const currentConvo = state.conversations.find(c => c.id == state.activeConversationId);
    if (currentConvo && currentConvo.messages.length > 0) {
      if (confirm('Bạn có chắc chắn muốn xóa tin nhắn trong cuộc trò chuyện này? Giao thoại vẫn lưu trong lịch sử.')) {
        currentConvo.messages = [];
        localStorage.setItem('rigai_conversations', JSON.stringify(state.conversations));
        renderConversation();
        updateStatusPanel();
        window.showToast('Đã dọn dẹp các tin nhắn!');
      }
    } else {
      window.showToast('Hội thoại hiện đang trống!', 'error');
    }
  });
  
  // Config sliders and outputs
  elements.temperatureInput.addEventListener('input', (e) => {
    elements.tempVal.textContent = e.target.value;
  });
  
  elements.maxTokensInput.addEventListener('input', (e) => {
    elements.tokensVal.textContent = e.target.value;
  });
  
  // Toggle password visibility
  elements.toggleApiKey.addEventListener('click', () => {
    const type = elements.apiKeyInput.type === 'password' ? 'text' : 'password';
    elements.apiKeyInput.type = type;
    
    // Change SVG eye style depending on type
    if (type === 'password') {
      elements.toggleApiKey.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      `;
    } else {
      elements.toggleApiKey.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
      `;
    }
  });
  
  // Save Config button clicked
  elements.saveConfigBtn.addEventListener('click', () => {
    const key = elements.apiKeyInput.value.trim();
    const url = elements.apiUrlInput.value.trim() || 'https://rim8kde.abc-tunnel.us/v1';
    const temp = parseFloat(elements.temperatureInput.value);
    const tokens = parseInt(elements.maxTokensInput.value);
    
    let activeModel = elements.modelSelect.value;
    if (activeModel === 'custom') {
      activeModel = elements.customModelInput.value.trim() || 'custom-model';
    }
    
    state.apiKey = key;
    state.apiUrl = url;
    state.temperature = temp;
    state.maxTokens = tokens;
    state.activeModel = activeModel;
    
    localStorage.setItem('rigai_api_key', key);
    localStorage.setItem('rigai_api_url', url);
    localStorage.setItem('rigai_temperature', temp.toString());
    localStorage.setItem('rigai_max_tokens', tokens.toString());
    localStorage.setItem('rigai_active_model', activeModel);
    
    // Update active conversation parameters if inside one
    const currentConvo = state.conversations.find(c => c.id == state.activeConversationId);
    if (currentConvo) {
      currentConvo.systemPrompt = state.systemPrompt;
      currentConvo.temperature = temp;
      currentConvo.maxTokens = tokens;
      currentConvo.model = activeModel;
      localStorage.setItem('rigai_conversations', JSON.stringify(state.conversations));
    }
    
    checkApiKeyStatus();
    updateStatusPanel();
    elements.settingsPanel.classList.add('hidden'); // Close slide panel
    window.showToast('Đã lưu cấu hình thành công!');
  });
}

// Run app
init();
