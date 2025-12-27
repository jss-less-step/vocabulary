/**
 * 页面内容控制器 - 处理页面内容相关的 HTTP 请求
 */

const pageContentService = require('../service/pageContentService');
const { sendJson, parseJsonBody } = require('../utils/httpUtils');

/**
 * POST /save-page-content - 保存页面内容
 */
async function savePageContent(req, res) {
	try {
		const data = await parseJsonBody(req);
		const { content, url: pageUrl, title } = data;
		
		if (!content || !pageUrl) {
			sendJson(res, 400, { error: 'Missing required fields: content and url' });
			return;
		}

		const result = await pageContentService.savePageContent(content, pageUrl, title);
		sendJson(res, 200, result);
	} catch (err) {
		sendJson(res, 500, { error: err.message });
	}
}

/**
 * GET /page-contents - 获取所有页面内容（按最近访问排序）
 */
async function getPageContents(req, res, query) {
	try {
		// parse query params: page, limit, q (title), sortBy, order
		const page = parseInt(query.page, 10) || 1;
		const limit = parseInt(query.limit, 10) || 10;
		const q = query.q || '';
		const sortBy = query.sortBy || 'lastViewedAt'; // viewCount | lastViewedAt | capturedAt
		const order = query.order === 'asc' ? 1 : -1;

		const result = await pageContentService.getPageContentsWithLatestView({ page, limit, q, sortBy, order });
		sendJson(res, 200, result);
	} catch (err) {
		sendJson(res, 500, { error: err.message });
	}
}

/**
 * GET /page-contents/:id - 获取页面内容详情（记录访问日志）
 */
async function getPageContentById(req, res, pathname) {
	try {
		const id = pathname.split('/')[2];
		const page = await pageContentService.getPageContentById(id);
		
		if (!page) {
			sendJson(res, 404, { error: 'Page not found' });
			return;
		}
		
		// 记录访问日志
		await pageContentService.logPageContentView(id);
		
		sendJson(res, 200, { page });
	} catch (err) {
		sendJson(res, 500, { error: err.message });
	}
}

/**
 * GET /page-contents/:id/detail - 获取页面内容及关联生词（记录访问日志）
 */
async function getPageContentDetail(req, res, pathname) {
	try {
		const id = pathname.split('/')[2];
		const result = await pageContentService.getPageContentWithWords(id);
		
		if (!result) {
			sendJson(res, 404, { error: 'Page not found' });
			return;
		}
		
		// 记录访问日志
		await pageContentService.logPageContentView(id);
		
		sendJson(res, 200, result);
	} catch (err) {
		sendJson(res, 500, { error: err.message });
	}
}

/**
 * PUT /page-contents/:id/mark-read - 标记页面为已读
 */
async function markPageAsRead(req, res, pathname) {
	try {
		const id = pathname.split('/')[2];
		const result = await pageContentService.markPageContentAsRead(id);
		sendJson(res, 200, result);
	} catch (err) {
		sendJson(res, 500, { error: err.message });
	}
}

/**
 * DELETE /page-contents/:id - 删除页面内容
 */
async function deletePageContent(req, res, pathname) {
	try {
		const id = pathname.split('/')[2];
		const result = await pageContentService.deletePageContent(id);
		
		if (!result.deletedCount) {
			sendJson(res, 404, { error: 'Page not found' });
			return;
		}
		
		sendJson(res, 200, result);
	} catch (err) {
		sendJson(res, 500, { error: err.message });
	}
}

module.exports = {
	savePageContent,
	getPageContents,
	getPageContentById,
	getPageContentDetail,
	markPageAsRead,
	deletePageContent
};
