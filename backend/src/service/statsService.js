/**
 * 统计服务 - 处理各种统计数据和时间线
 */

const { getDb, COLLECTIONS } = require('../db');

/**
 * 获取总体统计
 */
async function getOverallStats() {
	try {
		const db = getDb();
		
		const masteredCount = await db.collection(COLLECTIONS.WORD_MASTERED)
			.countDocuments({ isMastered: true });

		const viewCount = await db.collection(COLLECTIONS.WORD_VIEWS)
			.countDocuments();

		const fetchDistinct = await db.collection(COLLECTIONS.WORD_FETCHES).distinct('word');
		const fetchCount = fetchDistinct.length;

		return {
			mastered: masteredCount,
			viewed: viewCount,
			fetched: fetchCount
		};
	} catch (err) {
		console.error('获取总体统计失败:', err.message);
		throw err;
	}
}

/**
 * 获取学习统计时间线
 */
async function getStatsTimeline(mode = 'day', count = 7) {
	try {
		const db = getDb();
		const timeline = [];
		let dateRanges = [];

		if (mode === 'day') {
			dateRanges = getDaysData(count);
		} else if (mode === 'week') {
			dateRanges = getWeeksData(count);
		} else if (mode === 'month') {
			dateRanges = getMonthsData(count);
		}

		for (const rangeInfo of dateRanges) {
			const startDate = rangeInfo.startDateObj;
			const endDate = rangeInfo.endDateObj;

			const viewsCount = await db.collection(COLLECTIONS.WORD_VIEWS)
				.countDocuments({
					viewedAt: { $gte: startDate, $lt: endDate }
				});

			const fetchCount = await db.collection(COLLECTIONS.WORD_FETCHES)
				.aggregate([
					{ $match: { fetchedAt: { $gte: startDate, $lt: endDate } } },
					{ $group: { _id: '$word' } },
					{ $count: 'count' }
				])
				.toArray()
				.then(r => r[0]?.count || 0);

			const masteredCount = await db.collection(COLLECTIONS.WORD_MASTERED)
				.countDocuments({
					isMastered: true,
					masteredAt: { $gte: startDate, $lt: endDate }
				});

			timeline.push({
				date: [rangeInfo.start, rangeInfo.end],
				label: rangeInfo.label,
				mastered: masteredCount,
				viewed: viewsCount,
				fetched: fetchCount
			});
		}

		return timeline;
	} catch (err) {
		console.error('获取学习统计时间线失败:', err.message);
		throw err;
	}
}

/**
 * 获取生词本操作时间线
 */
async function getCustomWordsTimeline(mode = 'day', count = 7) {
	try {
		const db = getDb();
		const timeline = [];
		let dateRanges = [];

		if (mode === 'day') {
			dateRanges = getDaysData(count);
		} else if (mode === 'week') {
			dateRanges = getWeeksData(count);
		} else if (mode === 'month') {
			dateRanges = getMonthsData(count);
		}

		for (const rangeInfo of dateRanges) {
			const startDate = rangeInfo.startDateObj;
			const endDate = rangeInfo.endDateObj;

			const addedCount = await db.collection(COLLECTIONS.CUSTOM_WORDS)
				.countDocuments({
					createdAt: { $gte: startDate, $lt: endDate }
				});

			const consumedCount = await db.collection(COLLECTIONS.WORD_MASTERED)
				.countDocuments({
					isMastered: true,
					masteredAt: { $gte: startDate, $lt: endDate }
				});

			timeline.push({
				date: [rangeInfo.start, rangeInfo.end],
				label: rangeInfo.label,
				added: addedCount,
				consumed: consumedCount
			});
		}

		return timeline;
	} catch (err) {
		console.error('获取生词本时间线失败:', err.message);
		throw err;
	}
}

/**
 * 获取指定日期范围内的学习统计
 */
async function getStatsByDateRange(startDate, endDate) {
	try {
		const db = getDb();
		const start = new Date(startDate);
		start.setHours(0, 0, 0, 0);
		const end = new Date(endDate);
		end.setHours(23, 59, 59, 999);

		const masteredWords = await db.collection(COLLECTIONS.WORD_MASTERED)
			.find({
				isMastered: true,
				masteredAt: { $gte: start, $lt: end }
			})
			.sort({ masteredAt: -1 })
			.toArray();

		const viewedRecords = await db.collection(COLLECTIONS.WORD_VIEWS)
			.find({
				viewedAt: { $gte: start, $lt: end }
			})
			.sort({ viewedAt: -1 })
			.toArray();

		const viewedWords = [];
		const viewedSet = new Set();
		viewedRecords.forEach(r => {
			if (!viewedSet.has(r.word)) {
				viewedSet.add(r.word);
				viewedWords.push({
					word: r.word,
					viewedAt: r.viewedAt
				});
			}
		});

		const fetchedWords = await db.collection(COLLECTIONS.WORD_FETCHES)
			.aggregate([
				{ $match: { fetchedAt: { $gte: start, $lt: end } } },
				{ $group: { _id: '$word', fetchCount: { $sum: 1 }, lastFetchedAt: { $max: '$fetchedAt' } } },
				{ $sort: { lastFetchedAt: -1 } },
				{ $limit: 100 }
			])
			.toArray();

		return {
			mastered: masteredWords.map(w => ({
				word: w.word,
				time: w.masteredAt
			})),
			viewed: viewedWords,
			fetched: fetchedWords.map(w => ({
				word: w._id,
				fetchCount: w.fetchCount
			}))
		};
	} catch (err) {
		console.error('获取日期范围统计失败:', err.message);
		throw err;
	}
}

/**
 * 获取指定日期范围内的生词本统计
 */
async function getCustomWordsStatsByDateRange(startDate, endDate) {
	try {
		const db = getDb();
		const start = new Date(startDate);
		start.setHours(0, 0, 0, 0);
		const end = new Date(endDate);
		end.setHours(23, 59, 59, 999);

		const addedWords = await db.collection(COLLECTIONS.CUSTOM_WORDS)
			.find({
				createdAt: { $gte: start, $lt: end }
			})
			.sort({ createdAt: -1 })
			.toArray();

		const consumedWords = await db.collection(COLLECTIONS.WORD_MASTERED)
			.find({
				isMastered: true,
				masteredAt: { $gte: start, $lt: end }
			})
			.sort({ masteredAt: -1 })
			.toArray();

		return {
			added: addedWords.map(w => ({
				word: w.word,
				time: w.createdAt
			})),
			consumed: consumedWords.map(w => ({
				word: w.word,
				time: w.masteredAt
			}))
		};
	} catch (err) {
		console.error('获取生词本统计失败:', err.message);
		throw err;
	}
}

// 辅助函数：获取最近几周的日期范围数据
function getWeeksData(numWeeks = 4) {
	const weeks = [];
	const now = new Date();
	const dayOfWeek = now.getDay();
	const diffToMonday = (dayOfWeek === 0 ? 6 : dayOfWeek - 1);

	let currentMonday = new Date(now);
	currentMonday.setDate(now.getDate() - diffToMonday);
	currentMonday.setHours(0, 0, 0, 0);

	for (let i = 0; i < numWeeks; i++) {
		const startOfWeek = new Date(currentMonday);
		startOfWeek.setDate(currentMonday.getDate() - (i * 7));
		const endOfWeek = new Date(startOfWeek);
		endOfWeek.setDate(startOfWeek.getDate() + 6);
		endOfWeek.setHours(23, 59, 59, 999);

		weeks.push({
			label: i === 0 ? "本周" : `前 ${i} 周`,
			start: startOfWeek.toLocaleString(),
			end: endOfWeek.toLocaleString(),
			startDateObj: startOfWeek,
			endDateObj: endOfWeek
		});
	}

	return weeks;
}

// 辅助函数：获取最近几个月的日期范围数据
function getMonthsData(numMonths = 12) {
	const months = [];
	const now = new Date();

	for (let i = 0; i < numMonths; i++) {
		const startOfMonth = new Date(now.getFullYear(), now.getMonth() - i, 1);
		const endOfMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
		endOfMonth.setHours(23, 59, 59, 999);

		const monthStr = String(startOfMonth.getMonth() + 1).padStart(2, '0');
		months.push({
			label: `${startOfMonth.getFullYear()}-${monthStr}`,
			start: startOfMonth.toLocaleString(),
			end: endOfMonth.toLocaleString(),
			startDateObj: startOfMonth,
			endDateObj: endOfMonth
		});
	}

	return months;
}

// 辅助函数：获取最近几天的日期范围数据
function getDaysData(numDays = 7) {
	const days = [];
	const now = new Date();
	const dayMs = 24 * 60 * 60 * 1000;
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

	for (let i = 0; i < numDays; i++) {
		const date = new Date(todayStart.getTime() - i * dayMs);
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const dateKey = `${year}-${month}-${day}`;
		const startOfDay = new Date(year, date.getMonth(), date.getDate(), 0, 0, 0);
		const endOfDay = new Date(year, date.getMonth(), date.getDate(), 23, 59, 59, 999);
		
		days.push({
			label: dateKey,
			date: dateKey,
			start: startOfDay.toLocaleString(),
			end: endOfDay.toLocaleString(),
			startDateObj: startOfDay,
			endDateObj: endOfDay
		});
	}

	return days;
}

module.exports = {
	getOverallStats,
	getStatsTimeline,
	getCustomWordsTimeline,
	getStatsByDateRange,
	getCustomWordsStatsByDateRange
};
