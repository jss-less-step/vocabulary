const https = require('https');

/**
 * 返回基于环境变量的 https 代理 agent（如果设置且可用）
 * 支持 HTTPS_PROXY / HTTP_PROXY（大小写皆可）。
 */
function getProxyAgent() {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || 'http://127.0.0.1:7890';
  if (!proxyUrl) return null;

  try {
    // 动态加载，若未安装则抛出并由调用方决定降级
    const { HttpsProxyAgent } = require('https-proxy-agent');
    return new HttpsProxyAgent(proxyUrl);
  } catch (e) {
    console.warn('https-proxy-agent not installed; proxy will be ignored.');
    return null;
  }
}

function httpGetWithTimeout(urlStr, timeoutMs = 5000, agent = null) {
  return new Promise((resolve, reject) => {
    const options = agent ? { agent } : undefined;
    const req = https.get(urlStr, options, (res) => {
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        let errBody = '';
        res.on('data', (chunk) => { errBody += chunk; });
        res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${errBody}`)));
        return;
      }
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve(body));
    });

    req.on('error', (e) => reject(e));

    req.setTimeout(timeoutMs, () => {
      try { req.destroy(new Error('request timeout')); } catch (e) { /* ignore */ }
      reject(new Error('request timeout'));
    });
  });
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

module.exports = {
  getProxyAgent,
  httpGetWithTimeout,
  delay
};
