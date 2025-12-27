// 配置后端服务器地址
const BACKEND_URL = 'http://localhost:3000';

// 监听来自 content.js 和 popup.js 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SAVE_WORD') {
    saveWordToBackend(request.data)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // 异步响应
  }
  
  if (request.type === 'GET_CUSTOM_WORDS') {
    getCustomWordsFromStorage()
      .then(words => sendResponse({ success: true, data: words }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.type === 'DELETE_WORD') {
    deleteWordFromStorage(request.wordId)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.type === 'FETCH_DEFINITIONS') {
    fetchDefinitions(request.word)
      .then(definitions => sendResponse({ success: true, data: definitions }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// 保存单词到后端
async function saveWordToBackend(wordData) {
  // 统一准备句子数组：为缺失 translation 的句子补齐翻译
  const sentences = await prepareSentences(wordData);

  // 转换为与预设单词库一致的格式
  const formattedData = {
    word: wordData.word,
    us: wordData.us || '',
    uk: wordData.uk || '',
    translations: (wordData.definitions || []).map(def => ({ translation: def, type: '' })),
    phrases: wordData.phrases || [],
    sentences,
    source: wordData.source,
    captureDate: new Date().toISOString(),
    id: Date.now().toString(),
    isCustom: true
  };
  
  try {
    const response = await fetch(`${BACKEND_URL}/custom-words`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formattedData)
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    const result = await response.json();
    
    // 同时保存到 Chrome 本地存储
    await saveToLocalStorage(wordData);
    
    return result;
  } catch (error) {
    console.error('Error saving to backend:', error);
    // 如果后端不可用，仅保存到本地存储
    await saveToLocalStorage(wordData);
    return { offline: true, data: wordData };
  }
}

// 保存单词到本地存储
async function saveToLocalStorage(wordData) {
  const sentences = await prepareSentences(wordData);
  return new Promise((resolve) => {
    chrome.storage.local.get(['customWords'], (result) => {
      const customWords = result.customWords || [];
      const newWord = {
        word: wordData.word,
        us: wordData.us || '',
        uk: wordData.uk || '',
        translations: (wordData.definitions || []).map(def => ({ translation: def, type: '' })),
        phrases: wordData.phrases || [],
        sentences,
        source: wordData.source,
        id: Date.now().toString(),
        captureDate: new Date().toISOString(),
        synced: false,
        isCustom: true
      };
      customWords.push(newWord);
      chrome.storage.local.set({ customWords }, resolve);
    });
  });
}

// 从本地存储获取自定义词汇
async function getCustomWordsFromStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['customWords'], (result) => {
      resolve(result.customWords || []);
    });
  });
}

// 删除单词
async function deleteWordFromStorage(wordId) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['customWords'], (result) => {
      const customWords = (result.customWords || []).filter(w => w.id !== wordId);
      chrome.storage.local.set({ customWords }, resolve);
    });
  });
}

// 获取单词释义（调用后端 API 或本地词库）
async function fetchDefinitions(word) {
  // 先查缓存（翻译/释义）
  const cached = await getCachedDefinitions(word);
  if (cached && cached.length) return cached;

  // 先查本地已保存的自定义词汇
  const localDefs = await findLocalDefinitions(word);
  if (localDefs && localDefs.length) {
    await cacheDefinitions(word, localDefs);
    return localDefs;
  }

  // 客户端直接调用翻译服务（公共接口）
  const clientTrans = await translateTextClient(word);
  if (clientTrans && clientTrans.length) {
    await cacheDefinitions(word, clientTrans);
    return clientTrans;
  }

  // 所有方法都失败时，返回空数组
  // 用户可以在 popup 中手动添加释义，或在 custom-words.html 中补充
  console.debug(`No definitions found for word: ${word}`);
  return [];
}

async function getCachedDefinitions(word) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['translationCache'], (res) => {
      const cache = res.translationCache || {};
      resolve(cache[word]?.definitions || []);
    });
  });
}

async function cacheDefinitions(word, definitions) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['translationCache'], (res) => {
      const cache = res.translationCache || {};
      cache[word] = { definitions, ts: Date.now() };
      chrome.storage.local.set({ translationCache: cache }, resolve);
    });
  });
}

async function findLocalDefinitions(word) {
  const customWords = await getCustomWordsFromStorage();
  const hit = customWords.find(w => (w.word || '').toLowerCase() === word.toLowerCase());
  if (!hit) return [];
  const translations = hit.translations || [];
  return translations
    .map(t => typeof t === 'string' ? t : (t.translation || ''))
    .filter(Boolean);
}

// 客户端翻译：使用 Google 公共接口，返回可能的多条短译文（最多3条）
async function translateTextClient(text) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    if (!res.ok) return [];
    const data = await res.json();
    const parts = data?.[0] || [];
    const defs = [];
    if (Array.isArray(parts)) {
      for (let i = 0; i < Math.min(parts.length, 3); i++) {
        const part = parts[i];
        if (Array.isArray(part) && part[0]) defs.push(part[0]);
      }
    }
    return defs;
  } catch (e) {
    console.debug('Client translate failed:', e);
    return [];
  }
}

// 辅助：根据传入的 wordData 组装 sentences，并为缺失 translation 的句子调用服务端翻译
async function prepareSentences(wordData) {
  if (wordData.sentences && Array.isArray(wordData.sentences) && wordData.sentences.length > 0) {
    const filled = await Promise.all(
      wordData.sentences.map(async (s) => {
        const sentenceText = typeof s === 'string' ? s : (s?.sentence || '');
        let translation = (typeof s === 'object' && s?.translation) ? s.translation : '';
        if (sentenceText && !translation) {
          const tr = await translateTextClient(sentenceText);
          translation = tr[0] || '';
        }
        return { sentence: sentenceText, translation: translation || '' };
      })
    );
    return filled;
  }
  if (wordData.sentence) {
    const tr = await translateTextClient(wordData.sentence);
    return [{ sentence: wordData.sentence, translation: (tr[0] || '') }];
  }
  return [];
}

// 初始化扩展
chrome.runtime.onInstalled.addListener(() => {
  console.log('英语生词本助手已安装');
  
  // 初始化本地存储
  chrome.storage.local.get(['customWords'], (result) => {
    if (!result.customWords) {
      chrome.storage.local.set({ customWords: [] });
    }
  });
  
  // 创建定期同步任务
  chrome.alarms.create('syncOfflineWords', { periodInMinutes: 5 });
});

// 监听定期同步任务
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'syncOfflineWords') {
    syncOfflineWordsToBackend();
  }
});

// 同步离线词汇到后端（带重试机制）
async function syncOfflineWordsToBackend() {
  const customWords = await getCustomWordsFromStorage();
  const unsyncedWords = customWords.filter(w => !w.synced);
  
  for (const word of unsyncedWords) {
    await syncWordWithRetry(word, 3); // 最多重试3次
  }
}

// 带重试的单词同步函数
async function syncWordWithRetry(word, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${BACKEND_URL}/custom-words`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(word)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      if (data && data.success) {
        // 标记为已同步
        const allWords = await getCustomWordsFromStorage();
        const updated = allWords.map(w => 
          w.id === word.id ? { ...w, synced: true } : w
        );
        chrome.storage.local.set({ customWords: updated });
        console.log(`Word synced: ${word.word}`);
        return true;
      }
    } catch (error) {
      console.debug(`Sync attempt ${attempt}/${maxRetries} failed for word: ${word.word}`, error.message);
      
      // 如果是最后一次尝试，记录错误
      if (attempt === maxRetries) {
        console.error(`Failed to sync word after ${maxRetries} attempts: ${word.word}`);
      } else {
        // 等待后再重试（延时递增）
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }
  return false;
}
