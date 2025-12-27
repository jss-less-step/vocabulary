// 全局存储当前选中的单词和上下文
let currentSelection = {
  word: '',
  sentence: '',
  source: ''
};

// 防重复与抖动控制
let suppressProcessingOnce = false; // 关闭弹窗后抑制下一次 mouseup 处理
let lastSelectionSig = '';
let lastSelectionAt = 0;

const AUTO_SAVE_ENABLED = true; // 划词后自动保存到词库
const TIP_DEF_LIMIT = 5; // 浮动提示最多展示释义条数

// 检查是否为本地域名，如果是则不启用插件功能
// 例外：page-contents.html 页面始终启用
const hostname = window.location.hostname.toLowerCase();
const pathname = window.location.pathname.toLowerCase();
(function checkLocalDomain() {

  const isLocal =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    hostname.startsWith('172.16.') ||
    hostname.endsWith('.local') ||
    window.location.protocol === 'file:';

  // 特殊处理：page-contents.html 页面始终启用插件
  

  if (isLocal) {
    console.debug('English vocabulary extension: Disabled on local domain');
    return;
  }

  // 只有非本地域名或 page-contents 页面才初始化功能
  initExtension();
})();

function initExtension() {
  // 监听文本选择
  document.addEventListener('mouseup', (event) => {
    if (suppressProcessingOnce) {
      suppressProcessingOnce = false;
      return;
    }
    // 如果点击发生在提示弹窗内部，忽略本次处理，防止关闭后立即因同一次点击重新触发
    const tipEl = document.getElementById('word-capture-tip');
    const sentenceTipEl = document.getElementById('sentence-translation-tip');
    const path = event.composedPath ? event.composedPath() : [];
    if ((tipEl && path.includes(tipEl)) || (sentenceTipEl && path.includes(sentenceTipEl))) {
      return;
    }
    const selectedText = window.getSelection().toString().trim();

    // 提前返回：空选择
    if (!selectedText || selectedText.length === 0) {
      return;
    }

    // 去重防抖：相同选区在短时间内不重复处理
    const selectionObj = window.getSelection();
    const selectionRange = (selectionObj && selectionObj.rangeCount) ? selectionObj.getRangeAt(0) : null;
    const sig = selectionRange ? `${selectedText}|${selectionRange.startOffset}|${selectionRange.endOffset}` : selectedText;
    const now = Date.now();
    if (sig && sig === lastSelectionSig && (now - lastSelectionAt) < 800) {
      return;
    }
    lastSelectionSig = sig;
    lastSelectionAt = now;

    // 检查是否为句子（包含空格、标点或多个单词）
    const isSentence = /[\s,\.;:!?，。；：！？]/.test(selectedText) || selectedText.split(/\s+/).length > 1;

    if (isSentence) {
      // 句子翻译：不保存，只显示翻译
      if (selectedText.length > 500) {
        console.debug('Extension: Sentence too long (> 500 characters)');
        return;
      }
      // 句子不自动发音，由模态框中的按钮控制
      handleSentenceTranslation(selectedText);
      return;
    }

    // 以下是单词处理逻辑
    // 提前返回：不是单个英文单词
    // 只接受：纯字母、长度2-50字符的单个单词
    if (!/^[a-zA-Z]+$/.test(selectedText)) {
      console.debug('Extension: Not a single English word (contains non-letters)');
      return;
    }

    if (selectedText.length < 2) {
      console.debug('Extension: Word too short (< 2 letters)');
      return;
    }

    if (selectedText.length >= 50) {
      console.debug('Extension: Text too long (≥ 50 characters)');
      return;
    }

    // 选中即朗读单词（已通过纯英文验证）
    speakSelection(selectedText);

    // 通过验证，开始处理单词
    handleWordCapture(selectedText);
  });

  // 处理单词捕获
  function handleWordCapture(selectedText) {
    currentSelection.word = selectedText.toLowerCase();
    currentSelection.sentence = getContextSentence(selectedText);
    currentSelection.source = getNearestAnchorUrl();
    currentSelection.definitions = [];

    // 通知 popup 更新
    // 仅在扩展环境下尝试发送消息
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage(
        {
          type: 'WORD_SELECTED',
          data: currentSelection
        },
        () => {
          // popup 未打开或未监听，忽略错误
          const err = chrome.runtime.lastError;
          if (err) {
            console.debug('WORD_SELECTED not delivered:', err.message);
          }
        }
      );
    }

    // 异步获取释义/翻译后展示浮动提示并自动保存
    fetchDefinitionsForTip(currentSelection.word).then((defs) => {
      currentSelection.definitions = defs;

      // 获取预设词库信息以便显示完整内容（音标、例句等）
      searchWordInPreset(currentSelection.word).then((presetWordData) => {
        // 显示包含完整信息的提示框
        showCaptureTip(defs, presetWordData);

        // 准备保存的数据
        const dataToSave = {
          word: currentSelection.word,
          sentence: currentSelection.sentence,
          definitions: defs,
          source: currentSelection.source
        };

        // 如果在预设词汇库中找到，合并 sentences 和其他信息
        if (presetWordData && presetWordData.sentences && Array.isArray(presetWordData.sentences)) {
          // 先使用预设的 sentences，然后添加用户划词的句子
          dataToSave.sentences = [...presetWordData.sentences];

          // 如果用户划词的句子存在且不为空，添加到 sentences 末尾
          if (currentSelection.sentence && currentSelection.sentence.trim()) {
            dataToSave.sentences.push({
              sentence: currentSelection.sentence,
              translation: ''
            });
          }

          // 如果预设数据中有音标，也合并
          if (presetWordData.us) dataToSave.us = presetWordData.us;
          if (presetWordData.uk) dataToSave.uk = presetWordData.uk;
        } else {
          // 如果预设词汇中没有 sentences，仅使用用户划词的句子
          if (currentSelection.sentence && currentSelection.sentence.trim()) {
            dataToSave.sentences = [{
              sentence: currentSelection.sentence,
              translation: ''
            }];
          }
        }

        // 发送保存消息
        if (AUTO_SAVE_ENABLED && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage(
            {
              type: 'SAVE_WORD',
              data: dataToSave
            },
            () => {
              const err = chrome.runtime.lastError;
              if (err) {
                console.debug('Auto-save not delivered:', err.message);
              }
            }
          );
        }
      }).catch((error) => {
        console.debug('Search word failed, saving without preset data:', error);
        // 即使查询失败也显示基本释义
        showCaptureTip(defs, null);

        // 即使查询失败，仍然保存（使用划词时的上下文）
        if (AUTO_SAVE_ENABLED && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage(
            {
              type: 'SAVE_WORD',
              data: {
                word: currentSelection.word,
                sentence: currentSelection.sentence,
                definitions: defs,
                source: currentSelection.source
              }
            },
            () => {
              const err = chrome.runtime.lastError;
              if (err) {
                console.debug('Auto-save not delivered:', err.message);
              }
            }
          );
        }
      });
    }).catch(() => {
      // 获取释义失败，先显示占位提示
      showCaptureTip([], null);

      // 获取释义失败，仍然尝试查询单词信息并保存
      searchWordInPreset(currentSelection.word).then((presetWordData) => {
        const dataToSave = {
          word: currentSelection.word,
          sentence: currentSelection.sentence,
          definitions: [],
          source: currentSelection.source
        };

        if (presetWordData && presetWordData.sentences && Array.isArray(presetWordData.sentences)) {
          // 先使用预设的 sentences，然后添加用户划词的句子
          dataToSave.sentences = [...presetWordData.sentences];

          if (currentSelection.sentence && currentSelection.sentence.trim()) {
            dataToSave.sentences.push({
              sentence: currentSelection.sentence,
              translation: ''
            });
          }

          if (presetWordData.us) dataToSave.us = presetWordData.us;
          if (presetWordData.uk) dataToSave.uk = presetWordData.uk;
        } else {
          if (currentSelection.sentence && currentSelection.sentence.trim()) {
            dataToSave.sentences = [{
              sentence: currentSelection.sentence,
              translation: ''
            }];
          }
        }

        if (AUTO_SAVE_ENABLED && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage(
            {
              type: 'SAVE_WORD',
              data: dataToSave
            },
            () => {
              const err = chrome.runtime.lastError;
              if (err) {
                console.debug('Auto-save not delivered:', err.message);
              }
            }
          );
        }
      }).catch(() => {
        // 两个都失败，仅用划词时的数据保存
        const dataToSave = {
          word: currentSelection.word,
          definitions: [],
          source: currentSelection.source
        };

        if (currentSelection.sentence && currentSelection.sentence.trim()) {
          dataToSave.sentences = [{
            sentence: currentSelection.sentence,
            translation: ''
          }];
        }

        if (AUTO_SAVE_ENABLED && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage(
            {
              type: 'SAVE_WORD',
              data: dataToSave
            },
            () => {
              const err = chrome.runtime.lastError;
              if (err) {
                console.debug('Auto-save not delivered:', err.message);
              }
            }
          );
        }
      });
    });
  }

  // 发音：选中文本（单词或句子）
  function speakSelection(text) {
    if (!text) return;
    if (!window.speechSynthesis) {
      console.debug('speechSynthesis not supported');
      return;
    }

    const speakNow = (voice) => {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        if (voice) utter.voice = voice;
        utter.lang = 'en-US';
        utter.rate = 0.9;
        utter.pitch = 1;
        utter.volume = 1;
        window.speechSynthesis.speak(utter);
      } catch (err) {
        console.debug('TTS speak failed', err);
      }
    };

    const tryUseVoices = () => {
      const voices = window.speechSynthesis.getVoices() || [];
      if (voices.length) {
        const enVoice = voices.find(v => v.lang && v.lang.toLowerCase().startsWith('en')) || voices[0];
        speakNow(enVoice);
        return true;
      }
      return false;
    };

    if (!tryUseVoices()) {
      const onVoices = () => {
        tryUseVoices();
        window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
      };
      window.speechSynthesis.addEventListener('voiceschanged', onVoices, { once: true });
      setTimeout(() => {
        tryUseVoices() || speakNow();
      }, 300);
    }
  }

  // 提取单词所在的段落
  function getContextSentence(word) {
    try {
      const selection = window.getSelection();
      if (!selection.rangeCount) return '';

      // 获取选中文本的起始节点
      const range = selection.getRangeAt(0);
      let node = range.startContainer;

      // 如果是文本节点，获取其父元素
      if (node.nodeType === 3) {
        node = node.parentElement;
      }

      // 向上查找块级元素（段落容器）
      const blockElements = ['P', 'DIV', 'ARTICLE', 'SECTION', 'LI', 'TD', 'TH', 'BLOCKQUOTE', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'];
      let paragraphElement = node;

      while (paragraphElement && paragraphElement !== document.body) {
        if (blockElements.includes(paragraphElement.tagName)) {
          break;
        }
        paragraphElement = paragraphElement.parentElement;
      }

      // 如果找到段落元素，提取其文本内容
      if (paragraphElement && paragraphElement !== document.body) {
        const paragraphText = paragraphElement.innerText || paragraphElement.textContent || '';
        const cleanText = paragraphText.trim().replace(/\s+/g, ' ');

        // 限制长度，避免过长
        if (cleanText.length > 500) {
          // 如果段落太长，尝试提取包含该单词的句子
          const sentences = cleanText.split(/[.!?]+/);
          const targetSentence = sentences.find(s =>
            s.toLowerCase().includes(word.toLowerCase())
          );
          if (targetSentence) {
            return targetSentence.trim().substring(0, 300);
          }
          return cleanText.substring(0, 300) + '...';
        }

        return cleanText;
      }

      // 后备方案：如果没有找到合适的段落元素，返回选区周围的文本
      const bodyText = document.body.innerText || '';
      const wordIndex = bodyText.toLowerCase().indexOf(word.toLowerCase());
      if (wordIndex !== -1) {
        const start = Math.max(0, wordIndex - 100);
        const end = Math.min(bodyText.length, wordIndex + word.length + 100);
        return bodyText.substring(start, end).trim().replace(/\s+/g, ' ');
      }

      return '';
    } catch (error) {
      console.warn('Error extracting context sentence:', error);
      return '';
    }
  }

  // 获取最接近选区的锚点（元素 id 或标题），用于生成更精确的来源链接
  function getNearestAnchorUrl() {
    try {
      const selection = window.getSelection();
      if (!selection.rangeCount) return window.location.href;

      const baseUrl = window.location.origin + window.location.pathname;
      const range = selection.getRangeAt(0);
      let node = range.startContainer;
      if (node.nodeType === 3) {
        node = node.parentElement;
      }

      // 向上查找带 id 的元素（优先）
      const anchorEl = findClosestWithId(node);
      if (anchorEl && anchorEl.id) {
        return `${baseUrl}#${encodeURIComponent(anchorEl.id)}`;
      }

      // 备用：向上查找同级或上级最近的标题元素 H1-H6，要求有 id
      const headingEl = findNearestHeadingWithId(node);
      if (headingEl && headingEl.id) {
        return `${baseUrl}#${encodeURIComponent(headingEl.id)}`;
      }

      return window.location.href;
    } catch (err) {
      console.debug('Anchor resolve failed, fallback to href:', err);
      return window.location.href;
    }
  }

  function findClosestWithId(el) {
    let cur = el;
    while (cur && cur !== document.body) {
      if (cur.id && cur.id.trim().length > 0) {
        return cur;
      }
      cur = cur.parentElement;
    }
    return null;
  }

  function findNearestHeadingWithId(el) {
    const isHeadingWithId = (node) => {
      return node && /^H[1-6]$/.test(node.tagName) && node.id && node.id.trim().length > 0;
    };

    // 先检查自身及祖先链
    let cur = el;
    while (cur && cur !== document.body) {
      if (isHeadingWithId(cur)) return cur;
      cur = cur.parentElement;
    }

    // 再从当前元素向前扫描兄弟节点与其后代，寻找最近标题
    cur = el;
    while (cur && cur !== document.body) {
      let prev = cur.previousElementSibling;
      while (prev) {
        if (isHeadingWithId(prev)) return prev;
        // 在前一个兄弟的尾部向下深度优先找标题
        const found = prev.querySelector && prev.querySelector('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]');
        if (found) return found;
        prev = prev.previousElementSibling;
      }
      cur = cur.parentElement;
    }

    return null;
  }

  // 显示浮动提示
  function showCaptureTip(definitions = [], presetData = null) {
    // 在 document_start 阶段 body 可能尚未可用
    if (!document.body) return;

    // 移除旧的提示
    const oldTip = document.getElementById('word-capture-tip');
    if (oldTip) {
      oldTip.remove();
    }

    // 获取选区位置
    const selection = window.getSelection();
    let tipX = window.innerWidth / 2;
    let tipY = window.innerHeight / 2;

    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // 计算提示框位置：选区下方偏右
      tipX = rect.left + window.scrollX;
      tipY = rect.bottom + window.scrollY + 8; // 选区下方8px

      // 防止超出视口右侧
      const tipWidth = 380; // 增加预估宽度以适应更多内容
      if (tipX + tipWidth > window.innerWidth + window.scrollX) {
        tipX = window.innerWidth + window.scrollX - tipWidth - 20;
      }

      // 防止超出视口左侧
      if (tipX < window.scrollX + 10) {
        tipX = window.scrollX + 10;
      }
    }

    const tip = document.createElement('div');
    tip.id = 'word-capture-tip';

    // 构建标题（单词 + 音标）
    let titleHtml = `<span style="font-weight: 600; font-size: 18px;">${currentSelection.word}</span>`;
    if (presetData) {
      const phonetics = [];
      if (presetData.us) phonetics.push(`美 /${presetData.us}/`);
      if (presetData.uk) phonetics.push(`英 /${presetData.uk}/`);
      if (phonetics.length > 0) {
        titleHtml += `<div style="font-size: 11px; color: rgba(255,255,255,0.7); margin-top: 4px;">${phonetics.join(' &nbsp;•&nbsp; ')}</div>`;
      }
    }

    // 构建释义列表
    let defsHtml = '';
    if (definitions.length > 0) {
      defsHtml = `
      <div style="margin: 12px 0 8px 0; font-weight: 500; font-size: 12px; color: rgba(255,255,255,0.8); text-transform: uppercase; letter-spacing: 0.5px;">释义</div>
      ${definitions.slice(0, TIP_DEF_LIMIT).map((def, idx) =>
        `<div style="margin: 4px 0; padding-left: 10px; border-left: 2px solid rgba(255,255,255,0.4); font-size: 13px; line-height: 1.5;">
          ${idx + 1}. ${def}
        </div>`
      ).join('')}
    `;
    } else {
      defsHtml = '<div style="color: rgba(255,255,255,0.6); font-style: italic; font-size: 12px; margin: 8px 0;">正在查询释义...</div>';
    }

    // 构建例句（从预设数据或翻译后的句子）
    let sentencesHtml = '';
    if (presetData && presetData.sentences && Array.isArray(presetData.sentences)) {
      const sentences = presetData.sentences.filter(s => s.sentence && s.sentence.trim()).slice(0, 2);
      if (sentences.length > 0) {
        sentencesHtml = `
        <div style="margin: 12px 0 8px 0; font-weight: 500; font-size: 12px; color: rgba(255,255,255,0.8); text-transform: uppercase; letter-spacing: 0.5px;">例句</div>
        ${sentences.map(s => {
          const hasTrans = s.translation && s.translation.trim();
          return `
            <div style="margin: 6px 0; padding: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; font-size: 12px; line-height: 1.6;">
              <div style="color: #fff; margin-bottom: ${hasTrans ? '4px' : '0'};">${s.sentence}</div>
              ${hasTrans ? `<div style="color: rgba(255,255,255,0.75); font-size: 11px;">${s.translation}</div>` : ''}
            </div>
          `;
        }).join('')}
      `;
      }
    }

    tip.innerHTML = `
    <div style="margin-bottom: 10px;">
      ${titleHtml}
    </div>
    ${defsHtml}
    ${sentencesHtml}
    <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.2); font-size: 11px; color: rgba(255,255,255,0.6); text-align: center;">
      ✓ 已自动保存 • 点击扩展图标查看更多
    </div>
  `;

    tip.style.cssText = `
    position: absolute;
    left: ${tipX}px;
    top: ${tipY}px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 16px;
    border-radius: 8px;
    font-size: 14px;
    z-index: 99999;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.2);
    max-width: 380px;
    min-width: 260px;
    max-height: 500px;
    overflow-y: auto;
    animation: popIn 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    pointer-events: auto;
    cursor: default;
  `;

    document.body.appendChild(tip);

    // 点击弹窗外部时关闭，并清除选区避免 mouseup 再次触发选词逻辑导致闪烁
    const closeOnClickOutside = (e) => {
      if (!tip.contains(e.target)) {
        // 立即清理选区并设置一次性抑制标记，防止同次点击触发 mouseup 重新处理
        suppressProcessingOnce = true;
        const sel = window.getSelection();
        if (sel && sel.removeAllRanges) sel.removeAllRanges();
        tip.style.animation = 'popOut 0.2s ease-in';
        setTimeout(() => {
          tip.remove();
          if (document.removeEventListener) {
            document.removeEventListener('mousedown', closeOnClickOutside);
          }
        }, 200);
      }
    };

    // 延迟添加监听器，避免当前点击触发关闭
    setTimeout(() => {
      document.addEventListener('mousedown', closeOnClickOutside);
    }, 100);
  }

  // 添加动画样式
  const style = document.createElement('style');
  style.id = 'word-capture-style';
  style.textContent = `
  @keyframes popIn {
    from {
      opacity: 0;
      transform: scale(0.8) translateY(-10px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }
  
  @keyframes popOut {
    from {
      opacity: 1;
      transform: scale(1);
    }
    to {
      opacity: 0;
      transform: scale(0.9);
    }
  }
`;

  // 安全注入样式：head 可能为空，或内容脚本重复注入
  const styleTarget = document.head || document.documentElement || document.body;
  if (styleTarget) {
    if (!document.getElementById('word-capture-style')) {
      styleTarget.appendChild(style);
    }
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      const lateTarget = document.head || document.documentElement || document.body;
      if (lateTarget && !document.getElementById('word-capture-style')) {
        lateTarget.appendChild(style);
      }
    }, { once: true });
  }

  // 创建页面内容捕获按钮
  function createPageCaptureButton() {
    // 检查按钮是否已存在
    if (document.getElementById('page-capture-button')) {
      return;
    }

    const button = document.createElement('div');
    button.id = 'page-capture-button';
    button.title = '点击提取并保存页面内容 (Ctrl+Shift+C)';
    
    button.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; cursor: pointer; user-select: none;">
        <span style="font-size: 20px;">📄</span>
      </div>
    `;

    button.style.cssText = `
      position: fixed;
      right: 20px;
      top: 50%;
      transform: translateY(-50%);
      width: 50px;
      height: 50px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: 2px solid white;
      border-radius: 50%;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2);
      z-index: 99998;
      cursor: pointer;
      transition: all 0.3s ease;
    `;

    // 添加悬停效果
    button.addEventListener('mouseenter', () => {
      button.style.transform = 'translateY(-50%) scale(1.1)';
      button.style.boxShadow = '0 8px 20px rgba(102, 126, 234, 0.6), 0 4px 12px rgba(0, 0, 0, 0.3)';
    });

    button.addEventListener('mouseleave', () => {
      button.style.transform = 'translateY(-50%) scale(1)';
      button.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2)';
    });

    // 点击事件：执行页面内容提取和保存
    button.addEventListener('click', () => {
      // 提取内容
      const html = extractPageContentHTML();
      const url = window.location.href;
      const title = document.title || 'Untitled';
      
      // 打印到控制台
      console.log('📄 页面内容已提取，正在保存...');
      printPageContentHTML();
      
      // 发送到后端保存
      savePageContentToBackend(html, url, title);
      
      // 视觉反馈：按钮闪烁
      button.style.animation = 'buttonPulse 0.6s ease-out';
      setTimeout(() => {
        button.style.animation = '';
      }, 600);
    });

    document.body.appendChild(button);
  }

  // 添加按钮闪烁动画到样式
  const buttonStyle = document.createElement('style');
  buttonStyle.id = 'page-capture-button-style';
  buttonStyle.textContent = `
    @keyframes buttonPulse {
      0% {
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2);
        transform: translateY(-50%) scale(1);
      }
      50% {
        box-shadow: 0 8px 24px rgba(102, 126, 234, 0.8), 0 4px 16px rgba(0, 0, 0, 0.3);
        transform: translateY(-50%) scale(1.15);
      }
      100% {
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2);
        transform: translateY(-50%) scale(1);
      }
    }
  `;

  const styleTarget2 = document.head || document.documentElement || document.body;
  if (styleTarget2 && !document.getElementById('page-capture-button-style')) {
    styleTarget2.appendChild(buttonStyle);
  }

  // 等待 DOM 准备好后创建按钮
  if (document.body) {
    createPageCaptureButton();
  } else {
    document.addEventListener('DOMContentLoaded', createPageCaptureButton, { once: true });
  }

  // 提取网页内容并保留原始标签结构
  function extractPageContentHTML() {
    try {

      // 需要排除的标签
      const excludeTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG', 'PATH', 'META', 'LINK', 'HEAD']);
      
      // 需要保留的内容标签
      const contentTags = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'CODE']);
      
      // 递归遍历 DOM 树，构建 HTML 字符串
      function traverse(node) {
        // 跳过排除的标签
        if (node.nodeType === 1 && excludeTags.has(node.tagName)) {
          return '';
        }
        
        // 跳过不可见元素
        if (node.nodeType === 1) {
          const style = window.getComputedStyle(node);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return '';
          }
        }
        
        // 处理文本节点
        if (node.nodeType === 3) {
          const text = node.textContent.trim();
          return text;
        }
        
        // 处理元素节点
        if (node.nodeType === 1) {
          // 如果是内容标签，保留标签结构
          if (contentTags.has(node.tagName)) {
            const tagName = node.tagName.toLowerCase();
            let innerHTML = '';
            
            // 遍历子节点获取内容
            const children = node.childNodes;
            for (let i = 0; i < children.length; i++) {
              innerHTML += traverse(children[i]);
            }
            
            // 如果有内容，返回带标签的HTML
            if (innerHTML.trim().length > 0) {
              return `<${tagName}>${innerHTML}</${tagName}>\n`;
            }
            return '';
          } else {
            // 非内容标签，只遍历子节点
            let content = '';
            const children = node.childNodes;
            for (let i = 0; i < children.length; i++) {
              content += traverse(children[i]);
            }
            return content;
          }
        }
        
        return '';
      }
      
      // 从 body 开始遍历
      if (document.body) {
        const html = traverse(document.body);
        return html.trim();
      }
      
      return '';
    } catch (error) {
      console.error('提取页面内容HTML失败:', error);
      return '';
    }
  }
  
  // 打印网页内容HTML（保留标签结构）
  function printPageContentHTML() {
    const html = extractPageContentHTML();
    console.log('=== 网页内容HTML（保留标签） ===');
    console.log('字符总数:', html.length);
    console.log('HTML标签数:', (html.match(/<[^>]+>/g) || []).length);
    console.log('=== 内容HTML开始 ===');
    console.log(html);
    console.log('=== 内容HTML结束 ===');
    return html;
  }

  // 监听来自 popup 的消息（仅在扩展环境下）
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === 'GET_SELECTION') {
        sendResponse(currentSelection);
      } else if (request.type === 'EXTRACT_PAGE_CONTENT_HTML') {
        // 提取并返回页面内容HTML（保留标签）
        const html = extractPageContentHTML();
        sendResponse({ success: true, html: html, length: html.length });
      } else if (request.type === 'PRINT_PAGE_CONTENT_HTML') {
        // 打印页面内容HTML到控制台
        const html = printPageContentHTML();
        sendResponse({ success: true, length: html.length });
      }
    });
  }
  
  // 添加快捷键：Ctrl+Shift+C 提取并保存页面内容HTML
  document.addEventListener('keydown', (e) => {
    // 将 key 转为大写以兼容不同键盘状态
    const key = e.key.toUpperCase();
    
    if (e.ctrlKey && e.shiftKey && key === 'C') {
      e.preventDefault();
      
      // 提取内容
      const html = extractPageContentHTML();
      const url = window.location.href;
      const title = document.title || 'Untitled';
      
      // 打印到控制台
      printPageContentHTML();
      
      // 发送到后端保存
      savePageContentToBackend(html, url, title);
    }
  });
  
  // 保存页面内容到后端
  function savePageContentToBackend(content, url, title) {
    const BACKEND_URL = 'http://localhost:3000';
    
    fetch(`${BACKEND_URL}/save-page-content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: content,
        url: url,
        title: title,
        capturedAt: new Date().toISOString()
      })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        alert('页面内容已保存到数据库！');
        console.log('保存成功，ID:', data.id);
      } else {
        alert('保存失败: ' + (data.error || '未知错误'));
      }
    })
    .catch(error => {
      console.error('保存页面内容失败:', error);
      alert('保存失败，请检查后端服务是否运行');
    });
  }

  // 获取释义/翻译用于浮动提示
  function fetchDefinitionsForTip(word) {
    return new Promise((resolve) => {
      if (!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage)) {
        resolve([]);
        return;
      }
      chrome.runtime.sendMessage({ type: 'FETCH_DEFINITIONS', word }, (response) => {
        if (chrome.runtime.lastError) {
          console.debug('FETCH_DEFINITIONS error:', chrome.runtime.lastError.message);
          resolve([]);
          return;
        }
        if (response && response.success && Array.isArray(response.data)) {
          resolve(response.data);
        } else {
          resolve([]);
        }
      });
    });
  }

  // 在预设词汇库中搜索单词，获取完整信息（特别是 sentences）
  function searchWordInPreset(word) {
    return new Promise((resolve, reject) => {
      const BACKEND_URL = 'http://localhost:3000';

      try {
        const url = `${BACKEND_URL}/search-word?word=${encodeURIComponent(word)}`;
        fetch(url, { cache: 'no-store' })
          .then(response => response.json())
          .then(data => {
            if (data.found && data.data) {
              resolve(data.data);
            } else {
              resolve(null);
            }
          })
          .catch(error => {
            console.debug('Search word request failed:', error);
            reject(error);
          });
      } catch (error) {
        console.debug('Search word error:', error);
        reject(error);
      }
    });
  }

  // 处理句子翻译（不保存到词库）
  function handleSentenceTranslation(sentence) {
    console.debug('Extension: Translating sentence');

    // 调用谷歌翻译 API
    translateSentence(sentence).then((translation) => {
      if (translation) {
        showSentenceTranslationTip(sentence, translation);
      } else {
        console.debug('Extension: Translation failed');
      }
    }).catch((error) => {
      console.debug('Extension: Translation error:', error);
    });
  }

  // 调用谷歌翻译 API 翻译句子
  function translateSentence(text) {
    return new Promise((resolve) => {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`;

      fetch(url)
        .then(response => response.json())
        .then(data => {
          if (data && data[0] && Array.isArray(data[0])) {
            const translation = data[0].map(item => item[0]).join('');
            resolve(translation);
          } else {
            resolve(null);
          }
        })
        .catch(error => {
          console.debug('Translation request failed:', error);
          resolve(null);
        });
    });
  }

  // 显示句子翻译提示（仅展示，不保存）
  function showSentenceTranslationTip(sentence, translation) {
    // 移除已存在的提示框
    const existingTip = document.getElementById('sentence-translation-tip');
    if (existingTip) {
      existingTip.remove();
    }

    const tip = document.createElement('div');
    tip.id = 'sentence-translation-tip';

    // 计算弹窗位置（在选区附近）
    const selection = window.getSelection();
    const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    let tipX = 10;
    let tipY = 10;

    if (range) {
      const rect = range.getBoundingClientRect();
      tipX = rect.left + window.scrollX;
      tipY = rect.bottom + window.scrollY + 8;

      // 边界检测
      const tipWidth = 400;
      const tipHeight = 200;
      if (tipX + tipWidth > window.innerWidth + window.scrollX) {
        tipX = window.innerWidth + window.scrollX - tipWidth - 10;
      }
      if (tipY + tipHeight > window.innerHeight + window.scrollY) {
        tipY = rect.top + window.scrollY - tipHeight - 8;
      }
    }

    // 检查是否为纯英文内容（用于决定是否显示发音按钮）
    const isPureEnglish = /^[a-zA-Z0-9\s\.,;:!?\-'"()]+$/.test(sentence);
    const speakButtonHtml = isPureEnglish 
      ? `<button onclick="(function(){
          const text = '${sentence.replace(/'/g, "\\'")}';
          if (!window.speechSynthesis) return;
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance(text);
          utter.lang = 'en-US';
          utter.rate = 0.9;
          window.speechSynthesis.speak(utter);
        })()" style="
          background: rgba(255,255,255,0.2);
          border: 1px solid rgba(255,255,255,0.4);
          color: white;
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
          margin-top: 8px;
        " onmouseover="this.style.background='rgba(255,255,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.2)'">
          🔊 朗读原文
        </button>`
      : '';

    tip.innerHTML = `
    <div style="margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.2);">
      <div style="font-weight: 600; font-size: 13px; color: rgba(255,255,255,0.9); margin-bottom: 8px;">原文</div>
      <div style="font-size: 13px; line-height: 1.6; color: #fff;">${sentence}</div>
      ${speakButtonHtml}
    </div>
    <div style="margin-bottom: 8px;">
      <div style="font-weight: 600; font-size: 13px; color: rgba(255,255,255,0.9); margin-bottom: 8px;">翻译</div>
      <div style="font-size: 13px; line-height: 1.6; color: #fff;">${translation}</div>
    </div>
    <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.2); font-size: 11px; color: rgba(255,255,255,0.6); text-align: center;">
      句子翻译 • 不会保存到词库
    </div>
  `;

    tip.style.cssText = `
    position: absolute;
    left: ${tipX}px;
    top: ${tipY}px;
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    color: white;
    padding: 16px;
    border-radius: 8px;
    font-size: 14px;
    z-index: 99999;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.2);
    max-width: 400px;
    min-width: 280px;
    max-height: 500px;
    overflow-y: auto;
    animation: popIn 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    pointer-events: auto;
    cursor: default;
  `;

    document.body.appendChild(tip);

    // 点击弹窗外部时关闭，并清除选区避免鼠标事件重触发
    const closeOnClickOutside = (e) => {
      if (!tip.contains(e.target)) {
        // 立即清理选区并设置一次性抑制标记
        suppressProcessingOnce = true;
        const sel = window.getSelection();
        if (sel && sel.removeAllRanges) sel.removeAllRanges();
        tip.style.animation = 'popOut 0.2s ease-in';
        setTimeout(() => {
          tip.remove();
          if (document.removeEventListener) {
            document.removeEventListener('mousedown', closeOnClickOutside);
          }
        }, 200);
      }
    };

    // 延迟添加监听器，避免当前点击触发关闭
    setTimeout(() => {
      document.addEventListener('mousedown', closeOnClickOutside);
    }, 100);
  }

} // end of initExtension()
