/**
 * 标签统计服务 - 处理标签统计缓存 (TAG_STATS collection)
 */

const { getDb, COLLECTIONS } = require('../db');

/**
 * 获取单词掌握统计（按 tag）
 */
async function getMasteredStats(tag = null) {
	try {
		const db = getDb();
		const queryTag = tag || 'all';

		const stats = await db.collection(COLLECTIONS.TAG_STATS)
			.findOne({ tag: queryTag });

		if (!stats) {
			return {
				tag: queryTag,
				total: 0,
				mastered: 0,
				progress: 0
			};
		}

		return {
			tag: stats.tag,
			total: stats.total,
			mastered: stats.mastered,
			progress: stats.progress
		};
	} catch (err) {
		console.error('获取掌握统计失败:', err.message);
		throw err;
	}
}

/**
 * 获取所有标签的掌握统计
 */
async function getAllMasteredStats() {
	try {
		const db = getDb();
		const stats = await db.collection(COLLECTIONS.TAG_STATS)
			.find({})
			.sort({ total: -1 })
			.toArray();

		return stats.map(s => ({
			tag: s.tag,
			total: s.total,
			mastered: s.mastered,
			progress: s.progress
		}));
	} catch (err) {
		console.error('获取所有掌握统计失败:', err.message);
		throw err;
	}
}

/**
 * 刷新单个标签的统计数据
 */
async function refreshTagStats(tag) {
	try {
		const db = getDb();
		
		// 获取所有已掌握的单词
		const masteredRecords = await db.collection(COLLECTIONS.WORD_MASTERED)
			.find({ isMastered: true })
			.toArray();

		const masteredWords = new Set(masteredRecords.map(r => r.word));

		// 构建过滤条件
		const filter = tag === 'all' ? {} : { tags: tag };

		// 获取总词汇数
		const totalWords = await db.collection(COLLECTIONS.WORDS)
			.countDocuments(filter);

		// 获取该标签下的所有单词
		const allWordsInTag = await db.collection(COLLECTIONS.WORDS)
			.find(filter)
			.toArray();

		// 统计已掌握数量
		const masteredInTag = allWordsInTag.filter(w => masteredWords.has(w.word)).length;
		const progress = totalWords > 0 ? Math.round((masteredInTag / totalWords) * 100) : 0;

		const stats = {
			tag,
			total: totalWords,
			mastered: masteredInTag,
			progress,
			updatedAt: new Date()
		};

		// 保存到缓存表
		await db.collection(COLLECTIONS.TAG_STATS).updateOne(
			{ tag },
			{ $set: stats },
			{ upsert: true }
		);

		return stats;
	} catch (err) {
		throw new Error(`刷新标签统计失败: ${err.message}`);
	}
}

/**
 * 刷新所有标签的统计数据
 */
async function refreshAllTagStats() {
	try {
		const db = getDb();
		console.log('🔄 开始刷新标签统计缓存...');

		// 获取所有标签
		const tags = await db.collection(COLLECTIONS.WORDS).distinct('tags');
		const cleaned = tags.filter(t => t && typeof t === 'string');

		// 刷新每个标签
		for (const tag of cleaned) {
			await refreshTagStats(tag);
		}

		// 刷新全局统计
		await refreshTagStats('all');

		console.log(`✓ 标签统计缓存已刷新 (${cleaned.length + 1} 个标签)`);
	} catch (err) {
		throw new Error(`刷新所有标签统计失败: ${err.message}`);
	}
}

module.exports = {
	getMasteredStats,
	getAllMasteredStats,
	refreshTagStats,
	refreshAllTagStats
};
