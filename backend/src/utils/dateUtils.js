/**
 * 日期时间工具函数
 */

/**
 * 获取今天开始时间（00:00:00）
 */
function getTodayStart() {
	const now = new Date();
	return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * 获取某天的开始和结束时间
 * @param {string} dateStr - 格式：YYYY-MM-DD
 * @returns {{ startDate: Date, endDate: Date }}
 */
function getDayRange(dateStr) {
	const [year, month, day] = dateStr.split('-').map(Number);
	const startDate = new Date(year, month - 1, day, 0, 0, 0, 0);
	const endDate = new Date(year, month - 1, day, 23, 59, 59, 999);
	return { startDate, endDate };
}

/**
 * 格式化日期为 YYYY-MM-DD
 * @param {Date} date - 日期对象
 * @returns {string}
 */
function formatDate(date) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/**
 * 根据天数计算起始日期
 * @param {number} days - 天数，0 表示今天，其他数值表示往前推的天数
 * @returns {Date}
 */
function getStartDate(days = 0) {
	const now = new Date();
	if (days === 0) {
		return new Date(now.getFullYear(), now.getMonth(), now.getDate());
	}
	return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * 获取 N 天前的日期开始时间
 * @param {number} days - 天数
 * @returns {Date}
 */
function getDaysBefore(days) {
	const todayStart = getTodayStart();
	const dayMs = 24 * 60 * 60 * 1000;
	return new Date(todayStart.getTime() - (days - 1) * dayMs);
}

/**
 * 生成日期范围的统计对象（初始化为 0）
 * @param {number} days - 天数
 * @returns {Object} { 'YYYY-MM-DD': 0, ... }
 */
function initDailyStats(days) {
	const todayStart = getTodayStart();
	const dayMs = 24 * 60 * 60 * 1000;
	const daysCount = days === 0 ? 1 : days;
	const dailyStats = {};

	for (let i = 0; i < daysCount; i++) {
		const date = new Date(todayStart.getTime() - i * dayMs);
		const dateKey = formatDate(date);
		dailyStats[dateKey] = 0;
	}

	return dailyStats;
}

module.exports = {
	getTodayStart,
	getDayRange,
	formatDate,
	getStartDate,
	getDaysBefore,
	initDailyStats
};
