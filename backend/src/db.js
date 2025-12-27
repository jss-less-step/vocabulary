/**
 * MongoDB 数据库连接和初始化模块
 * 
 * 功能：
 * 1. 连接到 MongoDB
 * 2. 初始化集合和索引
 * 3. 从 JSON 文件导入数据
 * 4. 提供数据库实例访问
 */

const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

// MongoDB 连接信息
const MONGO_URI = process.env.MONGO_URI || 'mongodb://jss12138:123456@127.0.0.1:27017/lessStep?retryWrites=true&loadBalanced=false&connectTimeoutMS=10000&authSource=lessStep&authMechanism=SCRAM-SHA-1';
const DB_NAME = 'lessStep';

// 集合名称
const COLLECTIONS = {
	WORDS: 'words',
	CUSTOM_WORDS: 'customWords',
	WORD_VIEWS: 'wordViews',
	WORD_FETCHES: 'wordFetches',
	WORD_MASTERED: 'wordMastered',
	TAG_STATS: 'tagStats',
	PROGRESS: 'progress',
	DAILY_STATS: 'dailyStats',
	PAGE_CONTENTS: 'pageContents',
	PAGE_CONTENTS_LOGS: 'pageContentsLogs'
};

let client = null;
let db = null;

// 先导出 COLLECTIONS 和 getDb，供 service 使用
module.exports = { COLLECTIONS, getDb: () => db };

// 然后导入所有 Service（它们会使用上面导出的内容）
const vocabularyService = require('./service/vocabularyService');
const customWordsService = require('./service/customWordsService');
const wordStatsService = require('./service/wordStatsService');
const tagStatsService = require('./service/tagStatsService');
const statsService = require('./service/statsService');
const pageContentService = require('./service/pageContentService');
/**
 * 获取数据库实例
 */
function getDb() {
	if (!db) {
		throw new Error('Database not connected. Call connect() first.');
	}
	return db;
}

/**
 * 连接数据库
 */
async function connect() {
	try {
		if (db) return db;

		client = new MongoClient(MONGO_URI, {
			maxPoolSize: 10,
			serverSelectionTimeoutMS: 5000
		});

		await client.connect();
		db = client.db(DB_NAME);

		console.log(`✓ 已连接到 MongoDB: ${DB_NAME}`);

		// 初始化集合和索引
		await initializeCollections();

		return db;
	} catch (err) {
		console.error('❌ MongoDB 连接失败:', err.message);
		throw err;
	}
}

/**
 * 初始化集合和索引
 */
async function initializeCollections() {
	try {
		// 检查并创建集合
		const collections = await db.listCollections().toArray();
		const collectionNames = collections.map(c => c.name);

		// 创建 words 集合
		if (!collectionNames.includes(COLLECTIONS.WORDS)) {
			await db.createCollection(COLLECTIONS.WORDS);
			console.log(`✓ 创建集合: ${COLLECTIONS.WORDS}`);
		}

		// 创建 customWords 集合
		if (!collectionNames.includes(COLLECTIONS.CUSTOM_WORDS)) {
			await db.createCollection(COLLECTIONS.CUSTOM_WORDS);
			console.log(`✓ 创建集合: ${COLLECTIONS.CUSTOM_WORDS}`);
		}

		// 创建 wordViews 集合
		if (!collectionNames.includes(COLLECTIONS.WORD_VIEWS)) {
			await db.createCollection(COLLECTIONS.WORD_VIEWS);
			console.log(`✓ 创建集合: ${COLLECTIONS.WORD_VIEWS}`);
		}

		// 创建 wordFetches 集合
		if (!collectionNames.includes(COLLECTIONS.WORD_FETCHES)) {
			await db.createCollection(COLLECTIONS.WORD_FETCHES);
			console.log(`✓ 创建集合: ${COLLECTIONS.WORD_FETCHES}`);
		}

		// 创建 wordMastered 集合
		if (!collectionNames.includes(COLLECTIONS.WORD_MASTERED)) {
			await db.createCollection(COLLECTIONS.WORD_MASTERED);
			console.log(`✓ 创建集合: ${COLLECTIONS.WORD_MASTERED}`);
		}

		// 创建 progress 集合
		if (!collectionNames.includes(COLLECTIONS.PROGRESS)) {
			await db.createCollection(COLLECTIONS.PROGRESS);
			console.log(`✓ 创建集合: ${COLLECTIONS.PROGRESS}`);
		}

		// 创建 dailyStats 集合
		if (!collectionNames.includes(COLLECTIONS.DAILY_STATS)) {
			await db.createCollection(COLLECTIONS.DAILY_STATS);
			console.log(`✓ 创建集合: ${COLLECTIONS.DAILY_STATS}`);
		}

		// 创建索引
		await createIndexes();

	} catch (err) {
		console.error('初始化集合失败:', err.message);
		throw err;
	}
}

/**
 * 创建必要的索引
 */
async function createIndexes() {
	try {
		const wordsCollection = db.collection(COLLECTIONS.WORDS);
		const customWordsCollection = db.collection(COLLECTIONS.CUSTOM_WORDS);
		const wordViewsCollection = db.collection(COLLECTIONS.WORD_VIEWS);
		const wordFetchesCollection = db.collection(COLLECTIONS.WORD_FETCHES);
		const wordMasteredCollection = db.collection(COLLECTIONS.WORD_MASTERED);

		// words 集合索引
		await wordsCollection.createIndex({ word: 1 }, { unique: true, sparse: true });
		await wordsCollection.createIndex({ tags: 1 });
		await wordsCollection.createIndex({ isMastered: 1 });
		await wordsCollection.createIndex({ status: 1 });
		await wordsCollection.createIndex({ 'translations.translation': 'text' });
		await wordsCollection.createIndex({ wordViewCount: -1 });
		await wordsCollection.createIndex({ wordFetchesCount: -1 });
		console.log('  ✓ words 集合索引');

		// customWords 集合索引
		await customWordsCollection.createIndex({ word: 1 }, { unique: true, sparse: true });
		await customWordsCollection.createIndex({ wordId: 1 });
		await customWordsCollection.createIndex({ createdAt: -1 });
		console.log('  ✓ customWords 集合索引');

		// wordViews 集合索引
		await wordViewsCollection.createIndex({ word: 1, viewedAt: -1 });
		await wordViewsCollection.createIndex({ viewedAt: 1 });
		await wordViewsCollection.createIndex({ 'viewedAt': 1 }, { expireAfterSeconds: 7776000 });
		console.log('  ✓ wordViews 集合索引');

		// wordFetches 集合索引
		await wordFetchesCollection.createIndex({ word: 1, fetchedAt: -1 });
		await wordFetchesCollection.createIndex({ fetchedAt: 1 });
		await wordFetchesCollection.createIndex({ fetchedAt: 1 }, { expireAfterSeconds: 7776000 });
		console.log('  ✓ wordFetches 集合索引');

		// wordMastered 集合索引
		await wordMasteredCollection.createIndex({ word: 1 });
		await wordMasteredCollection.createIndex({ isMastered: 1, masteredAt: -1 });
		console.log('  ✓ wordMastered 集合索引');

		console.log('✓ 已创建所有数据库索引');
	} catch (err) {
		if (!err.message.includes('already exists')) {
			console.error('创建索引失败:', err.message);
		}
	}
}

/**
 * 从 JSON 文件导入词汇数据
 */
async function importVocabularyFromJson() {
	try {
		const wordsCollection = db.collection(COLLECTIONS.WORDS);

		// 检查是否已有数据
		const count = await wordsCollection.countDocuments();
		if (count > 0) {
			console.log(`✓ 词汇库已存在 ${count} 个单词，跳过导入`);
			return;
		}

		// 读取 merged-vocabulary.json
		const jsonPath = path.join(__dirname, '../../merged-vocabulary.json');
		if (!fs.existsSync(jsonPath)) {
			console.warn(`⚠ 词汇文件不存在: ${jsonPath}`);
			return;
		}

		const jsonData = fs.readFileSync(jsonPath, 'utf-8');
		const words = JSON.parse(jsonData);

		if (!Array.isArray(words) || words.length === 0) {
			console.warn('⚠ 词汇数据为空');
			return;
		}

		// 批量插入
		const result = await wordsCollection.insertMany(words, { ordered: false }).catch(err => {
			if (err.code === 11000) {
				console.warn(`⚠ 部分单词已存在，已跳过重复项`);
				return { insertedCount: words.length - (err.result?.result?.writeErrors?.length || 0) };
			}
			throw err;
		});

		console.log(`✓ 已导入 ${result.insertedCount} 个单词到 MongoDB`);
	} catch (err) {
		console.error('导入词汇数据失败:', err.message);
	}
}

/**
 * 获取数据库统计信息
 */
async function getStats() {
	try {
		if (!db) return null;

		const wordsCount = await db.collection(COLLECTIONS.WORDS).countDocuments();
		const customWordsCount = await db.collection(COLLECTIONS.CUSTOM_WORDS).countDocuments();

		return {
			wordsCount,
			customWordsCount,
			totalWords: wordsCount + customWordsCount,
			connected: true
		};
	} catch (err) {
		console.error('获取数据库统计失败:', err.message);
		return { connected: false, error: err.message };
	}
}


/**
 * 断开连接
 */
async function disconnect() {
	try {
		if (client) {
			await client.close();
			console.log('✓ 已断开 MongoDB 连接');
			client = null;
			db = null;
		}
	} catch (err) {
		console.error('断开连接失败:', err.message);
	}
}

// 重新导出所有内容
module.exports = {
	// 数据库连接
	connect,
	disconnect,
	getDb,
	getStats,
	importVocabularyFromJson,

	// 词汇操作 (委托给 vocabularyService)
	searchWord: vocabularyService.searchWord,
	getAllVocabulary: vocabularyService.getAllVocabulary,
	getWordsByTag: vocabularyService.getWordsByTag,
	getAllTags: vocabularyService.getAllTags,
	updateWordMastered: vocabularyService.updateWordMastered,
	addTagsToWord: vocabularyService.addTagsToWord,

	// 自定义词汇操作 (委托给 customWordsService)
	addOrUpdateCustomWord: customWordsService.addOrUpdateCustomWord,
	deleteCustomWord: customWordsService.deleteCustomWord,
	getCustomWords: customWordsService.getCustomWords,

	// 统计缓存刷新 (委托给 tagStatsService)
	refreshTagStats: tagStatsService.refreshTagStats,
	refreshAllTagStats: tagStatsService.refreshAllTagStats,

	// 单词查看日志 (委托给 wordStatsService)
	logWordView: wordStatsService.logWordView,
	getWordViewStats: wordStatsService.getWordViewStats,

	// 统计操作 (委托给 tagStatsService 和 wordStatsService)
	getMasteredStats: tagStatsService.getMasteredStats,
	getAllMasteredStats: tagStatsService.getAllMasteredStats,
	getRecentLearning: wordStatsService.getRecentLearning,
	getLearningTrend: wordStatsService.getLearningTrend,
	getDayWords: wordStatsService.getDayWords,
	getDayWordStats: wordStatsService.getDayWordStats,
	getMasteredPeriod: wordStatsService.getMasteredPeriod,
	getMasteredDayWords: wordStatsService.getMasteredDayWords,
	
	// 高级统计 (委托给 statsService)
	getOverallStats: statsService.getOverallStats,
	getStatsTimeline: statsService.getStatsTimeline,
	getCustomWordsTimeline: statsService.getCustomWordsTimeline,
	getStatsByDateRange: statsService.getStatsByDateRange,
	getCustomWordsStatsByDateRange: statsService.getCustomWordsStatsByDateRange,

	// 页面内容 (委托给 pageContentService)
	savePageContent: pageContentService.savePageContent,
	getPageContents: pageContentService.getPageContentsWithLatestView,
	getPageContentById: pageContentService.getPageContentById,
	markPageContentAsRead: pageContentService.markPageContentAsRead,
	deletePageContent: pageContentService.deletePageContent,
	logPageContentView: pageContentService.logPageContentView,
	getPageContentWithWords: pageContentService.getPageContentWithWords,
	getPageContentsWithLatestView: pageContentService.getPageContentsWithLatestView,

	// 常量
	COLLECTIONS,
	DB_NAME
};
		