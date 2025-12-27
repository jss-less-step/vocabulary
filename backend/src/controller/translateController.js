const https = require('https');
const { sendJson } = require('../utils/httpUtils');

// GET /translate?text=...&tl=zh-CN
async function translateText(req, res, query) {
  try {
    const text = (query.text || '').trim();
    if (!text) {
      sendJson(res, 400, { error: 'Missing text parameter' });
      return;
    }

    const target = query.tl || 'zh-CN';
    const params = new URLSearchParams({
      client: 'gtx',
      sl: 'auto',
      tl: target,
      dt: 't',
      q: text
    });

    const urlStr = `https://translate.googleapis.com/translate_a/single?${params.toString()}`;

    // 支持代理、重试与超时
    const maxAttempts = 2;
    const timeoutMs = 5000; // 5s

    // 使用共享工具检查并创建代理 agent（若可用）
    const { getProxyAgent, httpGetWithTimeout, delay } = require('../utils/proxyRequest');
    const agent = getProxyAgent();
    if (agent) console.log('Using proxy for translate requests');

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const raw = await httpGetWithTimeout(urlStr, timeoutMs, agent);
        // 尝试解析为 JSON
        try {
          const parsed = JSON.parse(raw);
          sendJson(res, 200, { ok: true, raw: parsed });
          return;
        } catch (e) {
          sendJson(res, 200, { ok: true, raw });
          return;
        }
      } catch (err) {
        console.error(`Translate attempt ${attempt} failed:`, err && err.message ? err.message : err);
        if (attempt === maxAttempts) {
          // 返回明确错误信息，前端可展示并提示离线或网络问题
          sendJson(res, 504, { error: 'Translate request failed', detail: err && err.message ? err.message : String(err) });
          return;
        }
        // 小的回退
        await delay(200 * attempt);
      }
    }
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
}


module.exports = {
  translateText
};
