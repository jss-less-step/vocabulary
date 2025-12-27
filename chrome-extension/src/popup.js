// DOM 元素
const captureTab = document.getElementById('capture-tab');
const libraryTab = document.getElementById('library-tab');
const tabBtns = document.querySelectorAll('.tab-btn');

const wordDisplay = document.getElementById('word-display');
const inputWord = document.getElementById('input-word');
const inputSentence = document.getElementById('input-sentence');
const newDefinitionInput = document.getElementById('new-definition');
const addDefinitionBtn = document.getElementById('add-definition-btn');
const definitionsList = document.getElementById('definitions-list');
const saveWordBtn = document.getElementById('save-word-btn');
const clearBtn = document.getElementById('clear-btn');

const wordsContainer = document.getElementById('words-container');
const captureStatus = document.getElementById('capture-status');
const libraryStatus = document.getElementById('library-status');

// 全局数据
let currentWord = {
  word: '',
  sentence: '',
  definitions: [],
  source: ''
};

let allCustomWords = [];

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initEventListeners();
  loadCurrentSelection();
  loadCustomWords();
});

// 标签页切换
function initTabs() {
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      
      // 更新按钮状态
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // 更新标签页显示
      const contents = document.querySelectorAll('.tab-content');
      contents.forEach(c => c.classList.remove('active'));
      
      if (tabName === 'capture') {
        captureTab.classList.add('active');
      } else if (tabName === 'library') {
        libraryTab.classList.add('active');
        loadCustomWords(); // 切换到词库时刷新
      }
    });
  });
}

// 事件监听
function initEventListeners() {
  // 添加释义
  addDefinitionBtn.addEventListener('click', () => {
    const def = newDefinitionInput.value.trim();
    if (def) {
      addDefinition(def);
      newDefinitionInput.value = '';
      newDefinitionInput.focus();
    }
  });
  
  newDefinitionInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addDefinitionBtn.click();
    }
  });
  
  // 保存单词
  saveWordBtn.addEventListener('click', saveWord);
  
  // 清除
  clearBtn.addEventListener('click', clearForm);
}

// 从 content.js 加载当前选择的词汇
function loadCurrentSelection() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_SELECTION' }, (response) => {
      if (chrome.runtime.lastError) {
        console.debug('GET_SELECTION not delivered:', chrome.runtime.lastError.message);
        return;
      }
      if (response) {
        currentWord = {
          word: response.word || '',
          sentence: response.sentence || '',
          definitions: [],
          source: response.source || ''
        };
        
        updateDisplay();
      }
    });
  });
}

// 更新显示
function updateDisplay() {
  const { word, sentence } = currentWord;
  
  if (word) {
    wordDisplay.innerHTML = `
      <div class="label">划词保存</div>
      <div class="word">${word}</div>
      <div class="sentence">${sentence || '(未找到句子)'}</div>
    `;
    inputWord.value = word;
    inputSentence.value = sentence;
    
    // 尝试获取释义
    fetchDefinitions(word);
  }
}

// 获取释义
function fetchDefinitions(word) {
  chrome.runtime.sendMessage(
    { type: 'FETCH_DEFINITIONS', word },
    (response) => {
      if (response && response.success && response.data && response.data.length > 0) {
        currentWord.definitions = response.data;
        renderDefinitions();
      }
    }
  );
}

// 添加释义
function addDefinition(definition) {
  if (!currentWord.definitions.includes(definition)) {
    currentWord.definitions.push(definition);
    renderDefinitions();
  }
}

// 删除释义
function deleteDefinition(index) {
  currentWord.definitions.splice(index, 1);
  renderDefinitions();
}

// 渲染释义列表
function renderDefinitions() {
  definitionsList.innerHTML = currentWord.definitions
    .map((def, index) => `
      <div class="definition-item">
        <span>${def}</span>
        <span class="delete-btn" data-delete-def="${index}" title="删除">×</span>
      </div>
    `)
    .join('');
}

// 保存单词
function saveWord() {
  const word = inputWord.value.trim().toLowerCase();
  const sentence = inputSentence.value.trim();
  const definitions = currentWord.definitions;
  
  if (!word) {
    showStatus('please_enter_word', 'error', '请输入或选择单词');
    return;
  }
  
  saveWordBtn.disabled = true;
  saveWordBtn.textContent = '保存中...';
  
  const wordData = {
    word,
    sentence,
    definitions,
    source: currentWord.source
  };
  
  chrome.runtime.sendMessage(
    { type: 'SAVE_WORD', data: wordData },
    (response) => {
      saveWordBtn.disabled = false;
      saveWordBtn.textContent = '💾 保存';
      
      if (response.success) {
        showStatus('save_success', 'success', 
          response.data.offline ? '离线保存成功，待网络连接时自动同步' : '保存成功！');
        clearForm();
        allCustomWords.push(response.data.data || wordData);
      } else {
        showStatus('save_error', 'error', '保存失败: ' + response.error);
      }
    }
  );
}

// 清除表单
function clearForm() {
  inputWord.value = '';
  inputSentence.value = '';
  currentWord.definitions = [];
  definitionsList.innerHTML = '';
  wordDisplay.innerHTML = `
    <div class="label">划词保存</div>
    <div class="word">-</div>
    <div class="sentence">在网页上划选英文单词...</div>
  `;
}

// 加载自定义词汇
function loadCustomWords() {
  // 优先从后端获取数据，保证与 custom-words.html 同步
  const BACKEND_URL = 'http://localhost:3000';
  
  fetch(`${BACKEND_URL}/custom-words`, { cache: 'no-store' })
    .then(response => response.json())
    .then(data => {
      allCustomWords = Array.isArray(data) ? data : [];
      renderCustomWords();
    })
    .catch(error => {
      console.debug('Failed to fetch from backend, falling back to storage:', error);
      // 后备方案：如果后端不可用，使用本地存储
      chrome.runtime.sendMessage(
        { type: 'GET_CUSTOM_WORDS' },
        (response) => {
          if (response && response.success) {
            allCustomWords = response.data || [];
            renderCustomWords();
          }
        }
      );
    });
}

// 渲染自定义词汇列表
function renderCustomWords() {
  if (allCustomWords.length === 0) {
    wordsContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <div class="empty-state-text">暂无自定义词汇<br>在网页上划选单词开始添加</div>
      </div>
    `;
    return;
  }
  
  wordsContainer.innerHTML = allCustomWords
    .sort((a, b) => new Date(b.captureDate) - new Date(a.captureDate))
    .map(word => {
      const date = new Date(word.captureDate);
      const dateStr = date.toLocaleDateString('zh-CN');
      const timeStr = date.toLocaleTimeString('zh-CN', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      
      const translations = word.translations || [];
      const definitions = translations.length > 0
        ? `<strong>释义：</strong>${translations.map(t => typeof t === 'string' ? t : (t.translation || '')).filter(Boolean).join('; ')}`
        : '<em style="color: #bbb">未添加释义</em>';
      
      const sentences = word.sentences || [];
      const sentence = sentences.length > 0 && sentences[0].sentence
        ? `<div class="word-item-sentence">"${sentences[0].sentence}"</div>`
        : '';
      
      return `
        <div class="word-item">
          <div class="word-item-header">
            <span class="word-item-word">${word.word}</span>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="word-item-date">${dateStr} ${timeStr}</span>
              <button class="word-item-delete" data-delete-id="${word.id}" title="删除">×</button>
            </div>
          </div>
          ${sentence}
          <div class="word-item-definitions">${definitions}</div>
        </div>
      `;
    })
    .join('');
}

// 删除单词
function deleteWord(wordId) {
  if (confirm('确定要删除这个单词吗？')) {
    const BACKEND_URL = 'http://localhost:3000';
    
    // 同时调用后端和本地存储删除
    fetch(`${BACKEND_URL}/custom-words`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: wordId })
    })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(data => {
        if (data && data.success) {
          allCustomWords = allCustomWords.filter(w => w.id !== wordId);
          renderCustomWords();
          showStatus('delete_success', 'info', '已删除', 'library-status');
          
          // 同时更新本地存储
          chrome.runtime.sendMessage(
            { type: 'DELETE_WORD', wordId },
            () => {
              // 本地删除完成
              console.debug('Local storage updated after backend deletion');
            }
          );
        }
      })
      .catch(error => {
        console.debug('Backend deletion failed, trying local storage only:', error);
        // 后备方案：如果后端不可用，仅删除本地存储
        chrome.runtime.sendMessage(
          { type: 'DELETE_WORD', wordId },
          (response) => {
            if (response && response.success) {
              allCustomWords = allCustomWords.filter(w => w.id !== wordId);
              renderCustomWords();
              showStatus('delete_success', 'info', '已删除（本地）', 'library-status');
            }
          }
        );
      });
  }
}

// 显示状态信息
function showStatus(id, type, message, targetId = 'capture-status') {
  const statusEl = document.getElementById(targetId);
  statusEl.className = `status-message ${type}`;
  statusEl.textContent = message;
  
  setTimeout(() => {
    statusEl.className = 'status-message';
  }, 3000);
}

// 事件委托：删除释义
if (definitionsList) {
  definitionsList.addEventListener('click', (e) => {
    const target = e.target;
    if (target && target.dataset && target.dataset.deleteDef !== undefined) {
      const idx = Number(target.dataset.deleteDef);
      if (!Number.isNaN(idx)) {
        deleteDefinition(idx);
      }
    }
  });
}

// 事件委托：删除单词
if (wordsContainer) {
  wordsContainer.addEventListener('click', (e) => {
    const target = e.target;
    if (target && target.dataset && target.dataset.deleteId) {
      deleteWord(target.dataset.deleteId);
    }
  });
}
