/**
 * 词汇控制器 - 处理词汇相关的 HTTP 请求
 */

const vocabularyService = require('../service/vocabularyService');
const wordStatsService = require('../service/wordStatsService');
const { sendJson, parseJsonBody } = require('../utils/httpUtils');

/**
 * GET /tags - 获取所有标签
 */
async function getAllTags(req, res) {
	try {
		const tags = await vocabularyService.getAllTags();
		sendJson(res, 200, { tags });
	} catch (err) {
		sendJson(res, 500, { error: err.message });
	}
}

/**
 * GET /search-word?word=xxx - 搜索单词
 */
async function searchWord(req, res, query) {
	try {
		const word = (query.word || '').trim();

		if (!word) {
			sendJson(res, 400, { error: 'Missing word parameter' });
			return;
		}

		const found = await vocabularyService.searchWord(word);
		
		if (found) {
			// 记录查看
			await wordStatsService.logWordView(word);
			sendJson(res, 200, { found: true, data: found });
		} else {
			sendJson(res, 200, { found: false, data: null });
		}
	} catch (err) {
		sendJson(res, 500, { error: err.message });
	}
}

/**
 * POST /vocabulary - 获取词汇列表
 */
async function getVocabulary(req, res) {
	try {
		const data = await parseJsonBody(req);
		const result = await vocabularyService.getAllVocabulary({
			skip: parseInt(data.skip || '0'),
			limit: parseInt(data.limit || '1000'),
			tags: Array.isArray(data.tags) ? data.tags.filter(Boolean) : [],
			excludeTags: Array.isArray(data.excludeTags) ? data.excludeTags.filter(Boolean) : [],
			search: data.search || data.query || null,
			sort: data.sort || null,
			weightFilter: data.weightFilter || null,
			hideMastered: data.hideMastered === true
		});

		// 如果返回的结果中有单词，记录获取次数
		if (result.data && Array.isArray(result.data) && result.data.length > 0) {
			const words = result.data.map(w => w.word).filter(Boolean);
			if (words.length > 0) {
				await wordStatsService.logWordFetches(words);
			}
		}

		sendJson(res, 200, result);
	} catch (err) {
		sendJson(res, 500, { error: err.message });
	}
}

/**
 * POST /word-mastered - 标记单词为已掌握
 */
async function markWordMastered(req, res) {
	try {
		const data = await parseJsonBody(req);
		const word = data.word;
		const isMastered = data.isMastered === true;

		if (!word) {
			sendJson(res, 400, { error: 'Missing word parameter' });
			return;
		}

		await vocabularyService.updateWordMastered(word, isMastered);
		sendJson(res, 200, { ok: true });
	} catch (err) {
		sendJson(res, 500, { error: err.message });
	}
}

/**
 * GET /word-views/:word - 获取单词查看统计
 */
async function getWordViews(req, res, pathname) {
	try {
		const word = pathname.replace('/word-views/', '');

		if (!word) {
			sendJson(res, 400, { error: 'Missing word parameter' });
			return;
		}

		const stats = await wordStatsService.getWordViewStats(word);
		sendJson(res, 200, stats);
	} catch (err) {
		sendJson(res, 500, { error: err.message });
	}
}

module.exports = {
	getAllTags,
	searchWord,
	getVocabulary,
	markWordMastered,
	getWordViews
};
