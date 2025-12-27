  // 提取网页内容并保留原始标签结构
  function extractPageContentHTML(window,document) {
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

  module.exports = {
	extractPageContentHTML
  };