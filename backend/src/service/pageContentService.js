/**
 * 页面内容服务 - 处理页面内容存储和访问日志
 */

const { getDb, COLLECTIONS } = require('../db');

/**
 * 保存页面内容
 */
async function savePageContent(content, url, title) {
	try {
		const db = getDb();
		const collection = db.collection(COLLECTIONS.PAGE_CONTENTS);

		const pageContent = {
			content,
			url,
			title: title || url,
			capturedAt: new Date()
		};

		const result = await collection.insertOne(pageContent);
		return { success: true, id: result.insertedId };
	} catch (err) {
		console.error('保存页面内容失败:', err.message);
		throw err;
	}
}

/**
 * 获取所有保存的页面内容列表（按最近访问时间排序）
 */
async function getPageContentsWithLatestView(options = {}) {
	try {
		const db = getDb();
		const collection = db.collection(COLLECTIONS.PAGE_CONTENTS);
		const logsCollectionName = COLLECTIONS.PAGE_CONTENTS_LOGS;

		const page = options.page && options.page > 0 ? options.page : 1;
		const limit = options.limit && options.limit > 0 ? options.limit : 10;
		const q = options.q ? String(options.q).trim() : '';
		const sortBy = options.sortBy || 'lastViewedAt';
		const order = options.order === 1 ? 1 : -1; // default desc

		const matchStage = {};
		if (q.length > 0) {
			matchStage.title = { $regex: q, $options: 'i' };
		}

		// Build aggregation with lookup to logs, compute viewCount and lastViewedAt
		const pipeline = [];
		if (Object.keys(matchStage).length) pipeline.push({ $match: matchStage });

		pipeline.push(
			{
				$lookup: {
					from: logsCollectionName,
					localField: '_id',
					foreignField: 'pageContentId',
					as: 'logs'
				}
			},
			{
				$addFields: {
					viewCount: { $size: { $ifNull: ['$logs', []] } },
					lastViewedAt: { $cond: [{ $gt: [{ $size: { $ifNull: ['$logs', []] } }, 0] }, { $max: '$logs.viewedAt' }, '$capturedAt'] }
				}
			},
			{
				$project: {
					content: 0,
					logs: 0
				}
			}
		);

		// sort
		const sortField = (sortBy === 'viewCount') ? 'viewCount' : (sortBy === 'capturedAt' ? 'capturedAt' : 'lastViewedAt');
		pipeline.push({ $sort: { [sortField]: order } });

		// facet to get total and paged results
		const skip = (page - 1) * limit;
		pipeline.push({
			$facet: {
				paged: [ { $skip: skip }, { $limit: limit } ],
				total: [ { $count: 'count' } ]
			}
		});

		const agg = await collection.aggregate(pipeline).toArray();
		const paged = (agg[0] && agg[0].paged) || [];
		const total = (agg[0] && agg[0].total && agg[0].total[0] && agg[0].total[0].count) ? agg[0].total[0].count : 0;

		return {
			pages: paged,
			total,
			page,
			limit
		};
	} catch (err) {
		console.error('获取页面内容列表失败:', err.message);
		throw err;
	}
}

/**
 * 根据ID获取页面内容详情
 */
async function getPageContentById(id) {
	try {
		const db = getDb();
		const collection = db.collection(COLLECTIONS.PAGE_CONTENTS);
		const { ObjectId } = require('mongodb');
		const page = await collection.findOne({ _id: new ObjectId(id) });
		return page;
	} catch (err) {
		console.error('获取页面内容详情失败:', err.message);
		throw err;
	}
}

/**
 * 获取页面内容及关联的生词
 */
async function getPageContentWithWords(pageContentId) {
	try {
		const db = getDb();
		const collection = db.collection(COLLECTIONS.PAGE_CONTENTS);
		const customWordsCollection = db.collection(COLLECTIONS.CUSTOM_WORDS);
		const { ObjectId } = require('mongodb');

		const page = await collection.findOne({ _id: new ObjectId(pageContentId) });
		if (!page) {
			return null;
		}

		const words = await customWordsCollection
			.find({ 
				source: { $eq: `page-content://${pageContentId}` }
			})
			.sort({ captureDate: -1 })
			.toArray();

		return {
			page,
			words
		};
	} catch (err) {
		console.error('获取页面内容和生词失败:', err.message);
		throw err;
	}
}

/**
 * 标记页面内容为已读
 */
async function markPageContentAsRead(id) {
	try {
		const db = getDb();
		const collection = db.collection(COLLECTIONS.PAGE_CONTENTS);
		const { ObjectId } = require('mongodb');

		const result = await collection.updateOne(
			{ _id: new ObjectId(id) },
			{ 
				$set: { 
					isRead: true,
					readAt: new Date()
				} 
			}
		);

		return { success: true, modifiedCount: result.modifiedCount };
	} catch (err) {
		console.error('标记页面为已读失败:', err.message);
		throw err;
	}
}

/**
 * 删除页面内容
 */
async function deletePageContent(id) {
	try {
		const db = getDb();
		const collection = db.collection(COLLECTIONS.PAGE_CONTENTS);
		const { ObjectId } = require('mongodb');

		const result = await collection.deleteOne({ _id: new ObjectId(id) });

		// 级联删除关联的访问日志
		if (result.deletedCount > 0) {
			const logsCollection = db.collection(COLLECTIONS.PAGE_CONTENTS_LOGS);
			await logsCollection.deleteMany({ pageContentId: new ObjectId(id) });
		}

		return { success: true, deletedCount: result.deletedCount };
	} catch (err) {
		console.error('删除页面内容失败:', err.message);
		throw err;
	}
}

/**
 * 记录页面内容访问日志
 */
async function logPageContentView(pageContentId) {
	try {
		const db = getDb();
		const collection = db.collection(COLLECTIONS.PAGE_CONTENTS_LOGS);
		const { ObjectId } = require('mongodb');

		const log = {
			pageContentId: new ObjectId(pageContentId),
			viewedAt: new Date()
		};

		await collection.insertOne(log);
		return { success: true };
	} catch (err) {
		console.error('记录页面访问日志失败:', err.message);
		throw err;
	}
}

module.exports = {
	savePageContent,
	getPageContentsWithLatestView,
	getPageContentById,
	getPageContentWithWords,
	markPageContentAsRead,
	deletePageContent,
	logPageContentView
};
