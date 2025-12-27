const { getProxyAgent, httpGetWithTimeout } = require('../utils/proxyRequest');
const pageContentService = require('../service/pageContentService');
const WorkerPool = require('./workerPool');
const path = require('path');
const os = require('os');

const host = 'https://www.bbc.com';
const agent = getProxyAgent();
if (agent) console.log('bbcService: using proxy agent');

// worker pool for parsing HTML (JSDOM) to avoid blocking main thread
const workerPath = path.resolve(__dirname, './bbcWorker.js');
const poolSize = Math.max(1, (os.cpus().length || 2) - 1);
const pool = new WorkerPool(workerPath, poolSize);

async function fetchBBCNews(timeoutMs = 10000) {
	const newsUrl = `${host}/news`;
	try {
		const html = await httpGetWithTimeout(newsUrl, timeoutMs, agent);
		console.log(`bbcService: fetched ${newsUrl}, length=${html ? html.length : 0}`);
		return html;
	} catch (err) {
		console.error('bbcService: fetch failed', err && err.message ? err.message : err);
		throw err;
	}
}

async function getNewsUrlStrs(timeoutMs = 10000) {
	const BBCHTMLStr = await fetchBBCNews(timeoutMs);
	const jsdom = require('jsdom');
	const { JSDOM } = jsdom;
	const dom = new JSDOM(BBCHTMLStr);
	const urlStrs = [];
	dom.window.document.querySelectorAll('a').forEach(a => {
		if (a.href.includes('/news/articles/')) {
			let fullUrl = a.href;
			if (fullUrl.startsWith('/')) {
				fullUrl = `${host}${fullUrl}`;
			}
			urlStrs.push(fullUrl);
		}
	});
	return urlStrs;
}

async function fetchBBCArticle(urlStr, timeoutMs = 10000) {
	try {
		const html = await httpGetWithTimeout(urlStr, timeoutMs, agent);
		console.log(`bbcArticleService: fetched ${urlStr}, length=${html ? html.length : 0}`);
		const { extractPageContentHTML } = require('../utils/domUtils')
		const { JSDOM } = require('jsdom');
		const dom = new JSDOM(html);
		return {
			content: extractPageContentHTML(dom.window, dom.window.document),
			url: urlStr,
			title: dom.window.document.querySelector('title') ? dom.window.document.querySelector('title').textContent : '',

		};
	} catch (err) {
		console.error('bbcArticleService: fetch failed', err && err.message ? err.message : err);
		throw err;
	}
}

// 根据 newsUrlStr 获取文章内容 html, 然后交给 worker 解析并在主线程保存到 DB
async function fetchAndProcessBBCArticle(timeoutMs = 10000, fetchConcurrency = 6) {
	const articleUrlStrs = await getNewsUrlStrs(timeoutMs);
	if (!Array.isArray(articleUrlStrs) || articleUrlStrs.length === 0) return;

	let idx = 0;
	const total = Math.min(articleUrlStrs.length, 10); //最多获取10条

	const fetchWorker = async () => {
		while (true) {
			const i = idx++;
			if (i >= total) break;
			const articleUrlStr = articleUrlStrs[i];
			try {
				const html = await httpGetWithTimeout(articleUrlStr, timeoutMs, agent);
				if (!html) {
					console.warn('Empty HTML for', articleUrlStr);
					continue;
				}

				// send html to worker for parsing
				const res = await pool.run({ html, url: articleUrlStr, title: '' });
				if (!res || !res.success) {
					console.error('Worker failed to parse', articleUrlStr, res && res.error);
					continue;
				}

				const content = res.content;
				if (!content) {
					console.warn('Parsed content empty for', articleUrlStr);
					continue;
				}

				try {
					const result = await pageContentService.savePageContent(content, articleUrlStr, res.title || '');
					console.log('Saved BBC article:', articleUrlStr, 'Result:', result);
				} catch (saveErr) {
					console.error('Failed to save BBC article:', articleUrlStr, saveErr && saveErr.message ? saveErr.message : saveErr);
				}
			} catch (err) {
				console.error('Error fetching or processing article', articleUrlStr, err && err.message ? err.message : err);
			}
			// small delay to avoid tight loop
			await new Promise(r => setTimeout(r, 150));
		}
	};

	const workers = [];
	const concurrency = Math.max(1, Math.min(fetchConcurrency, total));
	for (let w = 0; w < concurrency; w++) workers.push(fetchWorker());
	await Promise.all(workers);
}

module.exports = {
	fetchAndProcessBBCArticle,
}
