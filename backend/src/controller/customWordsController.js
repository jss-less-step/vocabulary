/**
 * 生词单词控制器 - 处理生词单词相关的 HTTP 请求
 */

const customWordsService = require('../service/customWordsService');
const { sendJson, parseJsonBody } = require('../utils/httpUtils');

/**
 * GET /custom-words - 获取所有生词单词
 */
async function getCustomWords(req, res) {
	try {
		const url = require('url');
		const q = url.parse(req.url, true).query || {};
		const page = parseInt(q.page, 10) || 1;
		const limit = Math.min(parseInt(q.limit, 10) || 12, 200);
		const sort = q.sort || 'date-desc';
		const query = q.query || '';
		const hideMastered = q.hideMastered === '1' || q.hideMastered === 'true';

		const result = await customWordsService.getCustomWords({ page, limit, query, sort, hideMastered });
		sendJson(res, 200, result);
	} catch (err) {
		sendJson(res, 500, { error: err.message });
	}
}

/**
 * POST /custom-words - 添加生词单词
 */
async function addCustomWord(req, res) {
	try {
		const wordData = await parseJsonBody(req);

		if (!wordData.word) {
			sendJson(res, 400, { error: 'Missing word field' });
			return;
		}

		// 直接交给 service 处理：插入/更新自定义单词并更新 words 表的状态为 mastered
		const result = await customWordsService.addOrUpdateCustomWord({
			...wordData,
			createdAt: wordData.createdAt || new Date()
		});

		sendJson(res, 200, {
			ok: true,
			data: wordData,
			isUpdate: result.isUpdate,
			upsertedId: result.upsertedId || null,
			message: result.isUpdate ? '单词已更新' : '单词已添加'
		});
	} catch (err) {
		sendJson(res, 500, { error: err.message });
	}
}

/**
 * DELETE /custom-words/:id - 删除生词单词
 */
async function deleteCustomWord(req, res, pathname) {
	try {
		const id = pathname.replace('/custom-words/', '');
		
		if (!id) {
			sendJson(res, 400, { error: 'Missing word id' });
			return;
		}

		const { ObjectId } = require('mongodb');
		try {
			const objectId = new ObjectId(id);
			await customWordsService.deleteCustomWord(objectId);
			sendJson(res, 200, { ok: true });
		} catch (err) {
			sendJson(res, 400, { error: 'Invalid word id' });
		}
	} catch (err) {
		sendJson(res, 500, { error: err.message });
	}
}

module.exports = {
	getCustomWords,
	addCustomWord,
	deleteCustomWord
};
