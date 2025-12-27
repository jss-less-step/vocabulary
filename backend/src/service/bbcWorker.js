const { parentPort } = require('worker_threads');

parentPort.on('message', async (msg) => {
  try {
    const { html, url, title } = msg || {};
    if (!html) {
      parentPort.postMessage({ success: false, error: 'no html' });
      return;
    }
    // parse using JSDOM and extract content
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM(html);
    const { extractPageContentHTML } = require('../utils/domUtils');
    const content = extractPageContentHTML(dom.window, dom.window.document);
    const docTitle = dom.window.document.querySelector('title') ? dom.window.document.querySelector('title').textContent : (title || '');
    parentPort.postMessage({ success: true, content, url, title: docTitle });
  } catch (err) {
    parentPort.postMessage({ success: false, error: err && err.message ? err.message : String(err) });
  }
});
