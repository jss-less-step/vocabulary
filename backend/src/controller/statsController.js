/**
 * 统计控制器 - 处理统计相关的 HTTP 请求
 */

const tagStatsService = require('../service/tagStatsService');
const wordStatsService = require('../service/wordStatsService');
const statsService = require('../service/statsService');
const { sendJson } = require('../utils/httpUtils');

/**
 * GET /mastered-stats - 获取所有标签的掌握统计
 */
async function getAllMasteredStats(req, res) {
	try {
		const stats = await tagStatsService.getAllMasteredStats();
		sendJson(res, 200, stats);
	} catch (err) {
		sendJson(res, 500, { error: err.message });
	}
}

/**
 * GET /mastered-stats/:tag - 获取特定标签的掌握统计
 */
async function getMasteredStatsByTag(req, res, pathname) {
	try {
		const tag = pathname.replace('/mastered-stats/', '');
		const stats = await tagStatsService.getMasteredStats(tag);
		sendJson(res, 200, stats);
	} catch (err) {
		sendJson(res, 500, { error: err.message });
	}
}

/**
 * GET /recent-learning?days=7 - 获取最近学习记录
 */
async function getRecentLearning(req, res, query) {
	try {
		const days = parseInt(query.days || '7');
		const records = await wordStatsService.getRecentLearning(days);
		sendJson(res, 200, records);
	} catch (err) {
		sendJson(res, 500, { error: err.message });
	}
}

/**
 * GET /learning-trend?days=7 - 获取学习趋势
 */
async function getLearningTrend(req, res, query) {
	try {
		const days = parseInt(query.days || '7');
		const trend = await wordStatsService.getLearningTrend(days);
		sendJson(res, 200, trend);
	} catch (err) {
		sendJson(res, 500, { error: err.message });
	}
}

/**
 * GET /day-words?date=2025-12-25 - 获取指定日期的单词
 */
async function getDayWords(req, res, query) {
	try {
		const date = query.date;
		if (!date) {
			sendJson(res, 400, { error: 'date 参数必须' });
			return;
		}
		const words = await wordStatsService.getDayWords(date);
		sendJson(res, 200, words);
	} catch (err) {
		sendJson(res, 500, { error: err.message });
	}
}

/**
 * GET /day-word-stats?days=0 - 获取指定天数内单词的查看次数统计
 */
async function getDayWordStats(req, res, query) {
	try {
		const days = parseInt(query.days || '0');
		const stats = await wordStatsService.getDayWordStats(days);
		sendJson(res, 200, stats);
	} catch (err) {
		sendJson(res, 500, { error: err.message });
	}
}

/**
 * GET /mastered-period?days=0|7|30 - 获取指定周期的已掌握单词列表
 */
async function getMasteredPeriod(req, res, query) {
	try {
		const days = parseInt(query.days || '0');
		const list = await wordStatsService.getMasteredPeriod(days);
		sendJson(res, 200, list);
	} catch (err) {
		sendJson(res, 500, { error: err.message });
	}
}

/**
 * GET /mastered-day-words?date=YYYY-MM-DD - 获取某天已掌握的单词列表
 */
async function getMasteredDayWords(req, res, query) {
	try {
		const date = query.date;
		if (!date) {
			sendJson(res, 400, { error: 'date 参数必须' });
			return;
		}
		const words = await wordStatsService.getMasteredDayWords(date);
		sendJson(res, 200, words);
	} catch (err) {
		sendJson(res, 500, { error: err.message });
	}
}

/**
 * GET /overall-stats - 获取总体统计
 */
async function getOverallStats(req, res) {
	try {
		const stats = await statsService.getOverallStats();
		sendJson(res, 200, stats);
	} catch (err) {
		sendJson(res, 500, { error: err.message });
	}
}

/**
 * GET /stats-timeline?mode=day&count=7 - 获取学习统计时间线
 */
async function getStatsTimeline(req, res, query) {
	try {
		const mode = query.mode || 'day';
		const count = parseInt(query.count || '7');
		const timeline = await statsService.getStatsTimeline(mode, count);
		sendJson(res, 200, timeline);
	} catch (err) {
		sendJson(res, 500, { error: err.message });
	}
}

/**
 * GET /custom-words-timeline?mode=day&count=7 - 获取生词本操作时间线
 */
async function getCustomWordsTimeline(req, res, query) {
	try {
		const mode = query.mode || 'day';
		const count = parseInt(query.count || '7');
		const timeline = await statsService.getCustomWordsTimeline(mode, count);
		sendJson(res, 200, timeline);
	} catch (err) {
		sendJson(res, 500, { error: err.message });
	}
}

/**
 * GET /stats-by-range?start=YYYY-MM-DD&end=YYYY-MM-DD - 获取指定日期范围的统计
 */
async function getStatsByRange(req, res, query) {
	try {
		const start = query.start;
		const end = query.end;
		if (!start || !end) {
			sendJson(res, 400, { error: 'start 和 end 参数必须' });
			return;
		}
		const stats = await statsService.getStatsByDateRange(start, end);
		sendJson(res, 200, stats);
	} catch (err) {
		sendJson(res, 500, { error: err.message });
	}
}

/**
 * GET /custom-words-stats-by-range?start=YYYY-MM-DD&end=YYYY-MM-DD - 获取生词本日期范围统计
 */
async function getCustomWordsStatsByRange(req, res, query) {
	try {
		const start = query.start;
		const end = query.end;
		if (!start || !end) {
			sendJson(res, 400, { error: 'start 和 end 参数必须' });
			return;
		}
		const stats = await statsService.getCustomWordsStatsByDateRange(start, end);
		sendJson(res, 200, stats);
	} catch (err) {
		sendJson(res, 500, { error: err.message });
	}
}

module.exports = {
	getAllMasteredStats,
	getMasteredStatsByTag,
	getRecentLearning,
	getLearningTrend,
	getDayWords,
	getDayWordStats,
	getMasteredPeriod,
	getMasteredDayWords,
	getOverallStats,
	getStatsTimeline,
	getCustomWordsTimeline,
	getStatsByRange,
	getCustomWordsStatsByRange
};
