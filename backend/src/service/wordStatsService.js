/**
 * 单词统计服务 - 处理单词查看、获取、掌握记录
 */

const { getDb, COLLECTIONS } = require('../db');
const {  getDayRange, formatDate, getStartDate, getDaysBefore, initDailyStats } = require('../utils/dateUtils');

/**
 * 记录单词查看
 */
async function logWordView(word) {
	try {
		const db = getDb();
		const viewsCollection = db.collection(COLLECTIONS.WORD_VIEWS);
		const wordsCollection = db.collection(COLLECTIONS.WORDS);

		// 1. 记录查看
		const result = await viewsCollection.insertOne({
			word: word,
			viewedAt: new Date(),
			timestamp: Date.now()
		});

		// 2. 更新 WORDS 表中的查看计数
		const viewCount = await viewsCollection.countDocuments({ word });
		await wordsCollection.updateOne(
			{ word: { $regex: `^${word}$`, $options: 'i' } },
			{ $set: { wordViewCount: viewCount } }
		);

		return result.insertedId;
	} catch (err) {
		console.error('记录单词查看失败:', err.message);
		throw err;
	}
}

/**
 * 获取单词查看统计
 */
async function getWordViewStats(word) {
	try {
		const db = getDb();
		const count = await db.collection(COLLECTIONS.WORD_VIEWS)
			.countDocuments({ word });
		return { word, totalViews: count };
	} catch (err) {
		console.error('获取单词查看统计失败:', err.message);
		throw err;
	}
}

/**
 * 记录单词获取
 */
async function logWordFetches(wordList = []) {
	try {
		if (!wordList || wordList.length === 0) return;
		const db = getDb();
		const fetchesCollection = db.collection(COLLECTIONS.WORD_FETCHES);
		const wordsCollection = db.collection(COLLECTIONS.WORDS);
		const now = new Date();
		const docs = wordList.map(w => ({
			word: w,
			fetchedAt: now,
			timestamp: now.getTime()
		}));
		await fetchesCollection.insertMany(docs, { ordered: false });

		// 更新每个单词的获取计数
		for (const word of wordList) {
			const fetchCount = await fetchesCollection.countDocuments({ word });

			await wordsCollection.updateOne(
				{ word: { $regex: `^${word}$`, $options: 'i' } },
				{ $set: { wordFetchesCount: fetchCount } }
			);
		}
	} catch (err) {
		console.error('记录单词获取失败:', err.message);
	}
}

/**
 * 获取最近学习的单词记录
 */
async function getRecentLearning(days = 7) {
	try {
		const db = getDb();
		const startDate = getStartDate(days);

		const records = await db.collection(COLLECTIONS.WORD_VIEWS)
			.aggregate([
				{
					$match: {
						viewedAt: { $gte: startDate }
					}
				},
				{
					$sort: { viewedAt: -1 }
				},
				{
					$group: {
						_id: '$word',
						word: { $first: '$word' },
						viewedAt: { $first: '$viewedAt' },
						timestamp: { $first: '$timestamp' }
					}
				},
				{
					$sort: { viewedAt: -1 }
				},
				{
					$limit: 100
				}
			])
			.toArray();

		return records.map(r => ({
			word: r.word,
			masteredAt: r.viewedAt || r.timestamp
		}));
	} catch (err) {
		throw new Error(`获取最近查看记录失败: ${err.message}`);
	}
}

/**
 * 获取学习统计趋势
 */
async function getLearningTrend(days = 7) {
	try {
		const db = getDb();
		const daysCount = days === 0 ? 1 : days;
		const startDate = getDaysBefore(daysCount);

		const records = await db.collection(COLLECTIONS.WORD_VIEWS)
			.find({
				viewedAt: { $gte: startDate }
			})
			.toArray();

		const dailyStats = initDailyStats(days);

		records.forEach(record => {
			const date = new Date(record.viewedAt || record.timestamp);
			const dateKey = formatDate(date);
			if (dailyStats[dateKey] !== undefined) {
				dailyStats[dateKey]++;
			}
		});

		return Object.keys(dailyStats)
			.sort()
			.map(date => ({
				date,
				count: dailyStats[date]
			}));
	} catch (err) {
		throw new Error(`获取学习趋势失败: ${err.message}`);
	}
}

/**
 * 获取指定日期的单词
 */
async function getDayWords(dateStr) {
	try {
		const db = getDb();
		const { startDate, endDate } = getDayRange(dateStr);

		const records = await db.collection(COLLECTIONS.WORD_VIEWS)
			.find({
				viewedAt: {
					$gte: startDate,
					$lt: endDate
				}
			})
			.sort({ viewedAt: -1 })
			.toArray();

		const seen = new Set();
		const words = [];
		for (const r of records) {
			const w = r.word;
			if (w && !seen.has(w)) {
				seen.add(w);
				words.push(w);
			}
		}
		return words;
	} catch (err) {
		throw new Error(`获取日期单词失败: ${err.message}`);
	}
}

/**
 * 获取指定天数内单词的查看次数统计
 */
async function getDayWordStats(days = 0) {
	try {
		const db = getDb();
		const startDate = getStartDate(days);

		const stats = await db.collection(COLLECTIONS.WORD_VIEWS)
			.aggregate([
				{
					$match: {
						viewedAt: { $gte: startDate }
					}
				},
				{
					$group: {
						_id: '$word',
						count: { $sum: 1 }
					}
				},
				{
					$sort: { count: -1 }
				},
				{
					$limit: 100
				}
			])
			.toArray();

		return stats.map(s => ({
			word: s._id,
			viewCount: s.count
		}));
	} catch (err) {
		throw new Error(`获取单词查看统计失败: ${err.message}`);
	}
}

/**
 * 获取指定周期内已掌握的单词列表
 */
async function getMasteredPeriod(days = 0) {
	try {
		const db = getDb();
		const daysCount = days === 0 ? 1 : days;
		const startDate = getDaysBefore(daysCount);

		const records = await db.collection(COLLECTIONS.WORD_MASTERED)
			.find({
				isMastered: true,
				masteredAt: { $gte: startDate }
			})
			.sort({ masteredAt: -1 })
			.limit(1000)
			.toArray();

		return records.map(r => ({
			word: r.word,
			masteredAt: r.masteredAt
		}));
	} catch (err) {
		throw new Error(`获取掌握周期列表失败: ${err.message}`);
	}
}

/**
 * 获取指定日期已掌握的单词列表
 */
async function getMasteredDayWords(dateStr) {
	try {
		const db = getDb();
		const { startDate, endDate } = getDayRange(dateStr);

		const records = await db.collection(COLLECTIONS.WORD_MASTERED)
			.find({
				isMastered: true,
				masteredAt: { $gte: startDate, $lt: endDate }
			})
			.sort({ masteredAt: -1 })
			.toArray();

		const seen = new Set();
		const words = [];
		for (const r of records) {
			const w = r.word;
			if (w && !seen.has(w)) {
				seen.add(w);
				words.push(w);
			}
		}
		return words;
	} catch (err) {
		throw new Error(`获取日期掌握单词失败: ${err.message}`);
	}
}

/**
 * 同步所有单词的计数（用于初始化或修复数据）
 */
async function syncWordCounts() {
	try {
		const db = getDb();
		const wordsCollection = db.collection(COLLECTIONS.WORDS);
		const viewsCollection = db.collection(COLLECTIONS.WORD_VIEWS);
		const fetchesCollection = db.collection(COLLECTIONS.WORD_FETCHES);

		// 获取所有单词
		const words = await wordsCollection.find({}).toArray();

		for (const wordDoc of words) {
			const word = wordDoc.word;

			// 统计查看数
			const viewCount = await viewsCollection.countDocuments({ word });

			// 统计获取数（distinct单词）
			const fetchCount = await fetchesCollection.aggregate([
				{ $match: { word } },
				{ $group: { _id: '$word' } },
				{ $count: 'count' }
			]).toArray().then(r => r[0]?.count || 0);

			await wordsCollection.updateOne(
				{ _id: wordDoc._id },
				{ 
					$set: { 
						wordViewCount: viewCount,
						wordFetchesCount: fetchCount
					} 
				}
			);
		}

		return { message: '单词计数同步完成' };
	} catch (err) {
		console.error('同步单词计数失败:', err.message);
		throw err;
	}
}

module.exports = {
	logWordView,
	getWordViewStats,
	logWordFetches,
	getRecentLearning,
	getLearningTrend,
	getDayWords,
	getDayWordStats,
	getMasteredPeriod,
	getMasteredDayWords,
	syncWordCounts
};
