/**
 * 词汇库服务 - 处理预设词汇 (WORDS collection)
 */

const { getDb, COLLECTIONS } = require('../db');

/**
 * 搜索单词
 */
async function searchWord(word) {
	try {
		const db = getDb();
		const collection = db.collection(COLLECTIONS.WORDS);
		const result = await collection.findOne({
			word: { $regex: `^${word}$`, $options: 'i' }
		});
		return result;
	} catch (err) {
		console.error('搜索单词失败:', err.message);
		throw err;
	}
}

/**
 * 获取所有词汇（支持分页和过滤）
 */
async function getAllVocabulary(options = {}) {
	try {
		const db = getDb();
		const collection = db.collection(COLLECTIONS.WORDS);
		const {
			skip = 0,
			limit = 1000,
			tags = [],
			excludeTags = [],
			search = null,
			sort = null,
			weightFilter = null,
			hideMastered = false
		} = options;

		const match = {};

		if (tags.length > 0) {
			match.tags = { $all: tags };
		}

		if (excludeTags.length > 0) {
			match.tags = { ...match.tags, $nin: excludeTags };
		}

		if (search) {
			match.$or = [
				{ word: { $regex: search, $options: 'i' } },
				{ 'translations.translation': { $regex: search, $options: 'i' } }
			];
		}

		if (weightFilter === 'gt0') {
			match.weight = { $gt: 0 };
		} else if (weightFilter === 'eq0') {
			match.weight = { $eq: 0 };
		}

		if (hideMastered) {
			match.status = { $ne: 'mastered' };
		}

		const pipeline = [
			{ $match: match }
		];

		// 长度排序需要先计算长度
		if (sort === 'length-desc' || sort === 'length-asc') {
			pipeline.push({ $addFields: { wordLength: { $strLenCP: '$word' } } });
		}

		// 排序
		if (sort === 'alpha') {
			pipeline.push({ $sort: { word: 1 } });
		} else if (sort === 'alpha-reverse') {
			pipeline.push({ $sort: { word: -1 } });
		} else if (sort === 'views-desc') {
			pipeline.push({ $sort: { wordViewCount: -1, word: 1 } });
		} else if (sort === 'views-asc') {
			pipeline.push({ $sort: { wordViewCount: 1, word: 1 } });
		} else if (sort === 'length-desc') {
			pipeline.push({ $sort: { wordLength: -1, word: 1 } });
		} else if (sort === 'length-asc') {
			pipeline.push({ $sort: { wordLength: 1, word: 1 } });
		} else if (sort === 'weight-desc') {
			pipeline.push({ $sort: { weight: -1 } });
		} else if (sort === 'weight-asc') {
			pipeline.push({ $sort: { weight: 1 } });
		} else if (sort === 'fetch-desc') {
			pipeline.push({ $sort: { wordFetchesCount: -1, word: 1 } });
		} else if (sort === 'fetch-asc') {
			pipeline.push({ $sort: { wordFetchesCount: 1, word: 1 } });
		} else {
			pipeline.push({ $sort: { word: 1 } });
		}

		// 投影：排除临时字段，减少数据传输
		pipeline.push({
			$project: {
				wordLength: 0
			}
		});

		// 聚合总数与分页数据
		pipeline.push({
			$facet: {
				total: [{ $count: 'count' }],
				data: [
					{ $skip: skip },
					{ $limit: limit }
				]
			}
		});

		const agg = await collection.aggregate(pipeline).toArray();
		const total = agg[0]?.total?.[0]?.count || 0;
		const data = agg[0]?.data || [];

		return {
			data,
			total,
			skip,
			limit,
			count: data.length
		};
	} catch (err) {
		console.error('获取词汇数据失败:', err.message);
		throw err;
	}
}

/**
 * 给某个单词添加tags属性
 */
async function addTagsToWord(word, tags) {
	try {
		const db = getDb();
		const collection = db.collection(COLLECTIONS.WORDS);
		const result = await collection.updateOne(
			{ word: { $regex: `^${word}$`, $options: 'i' } },
			{ $addToSet: { tags: { $each: tags } } }
		);
		return result.modifiedCount > 0;
	} catch (err) {
		console.error('给单词添加标签失败:', err.message);
		throw err;
	}
}

/**
 * 按标签获取词汇
 */
async function getWordsByTag(tag) {
	try {
		const db = getDb();
		const collection = db.collection(COLLECTIONS.WORDS);
		const words = await collection.find({ tags: tag }).toArray();
		return words;
	} catch (err) {
		console.error('按标签获取词汇失败:', err.message);
		throw err;
	}
}

/**
 * 获取所有标签分类
 */
async function getAllTags() {
	try {
		const db = getDb();
		const collection = db.collection(COLLECTIONS.WORDS);
		const tags = await collection.distinct('tags');
		const cleaned = tags.filter(t => t && typeof t === 'string');
		// 将 learning 放到最前
		if (cleaned.includes('learning')) {
			return ['learning', ...cleaned.filter(t => t !== 'learning')];
		}
		return cleaned;
	} catch (err) {
		console.error('获取标签失败:', err.message);
		throw err;
	}
}

/**
 * 编辑单词的 isMastered 字段
 */
async function updateWordMastered(word, isMastered) {
	try {
		const db = getDb();
		const wordsCollection = db.collection(COLLECTIONS.WORDS);
		const masteredCollection = db.collection(COLLECTIONS.WORD_MASTERED);
		const statsCollection = db.collection(COLLECTIONS.TAG_STATS);

		// 先获取单词信息
		const wordDoc = await wordsCollection.findOne({ word: { $regex: `^${word}$`, $options: 'i' } });

		// 更新 words 表
		const result = await wordsCollection.updateOne(
			{ word: { $regex: `^${word}$`, $options: 'i' } },
			{
				$set: {
					status: isMastered ? 'mastered' : 'vocabulary',
					updatedAt: new Date()
				}
			}
		);

		// 记录掌握时间
		if (result.modifiedCount > 0) {
			await masteredCollection.updateOne(
				{ word: word },
				{
					$set: {
						word: word,
						isMastered: isMastered,
						masteredAt: new Date(),
						timestamp: Date.now()
					}
				},
				{ upsert: true }
			);

			// 更新status
			const newStatus = isMastered ? 'mastered' : null;
			await wordsCollection.updateOne(
				{ word: { $regex: `^${word}$`, $options: 'i' } },
				{ $set: { status: newStatus } }
			);

			// 更新标签统计缓存
			if (wordDoc && wordDoc.tags) {
				const tags = Array.isArray(wordDoc.tags) ? wordDoc.tags : [wordDoc.tags];
				const delta = isMastered ? 1 : -1;

				for (const tag of tags) {
					await statsCollection.updateOne(
						{ tag },
						{
							$inc: { mastered: delta },
							$set: { updatedAt: new Date() }
						}
					);

					const tagStats = await statsCollection.findOne({ tag });
					if (tagStats && tagStats.total > 0) {
						const newProgress = Math.round((tagStats.mastered / tagStats.total) * 100);
						await statsCollection.updateOne(
							{ tag },
							{ $set: { progress: newProgress } }
						);
					}
				}

				// 更新全局统计
				await statsCollection.updateOne(
					{ tag: 'all' },
					{
						$inc: { mastered: delta },
						$set: { updatedAt: new Date() }
					}
				);

				const allStats = await statsCollection.findOne({ tag: 'all' });
				if (allStats && allStats.total > 0) {
					const newProgress = Math.round((allStats.mastered / allStats.total) * 100);
					await statsCollection.updateOne(
						{ tag: 'all' },
						{ $set: { progress: newProgress } }
					);
				}
			}
		}

		return result.modifiedCount > 0;
	} catch (err) {
		console.error('更新单词 isMastered 失败:', err.message);
		throw err;
	}
}

module.exports = {
	searchWord,
	getAllVocabulary,
	addTagsToWord,
	getWordsByTag,
	getAllTags,
	updateWordMastered
};
