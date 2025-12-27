/**
 * 自定义单词服务 - 处理用户自定义单词 (CUSTOM_WORDS collection)
 */

const { getDb, COLLECTIONS } = require('../db');

/**
 * 添加或更新自定义单词
 */
async function addOrUpdateCustomWord(wordData) {
	try {
		const db = getDb();
		const collection = db.collection(COLLECTIONS.CUSTOM_WORDS);
		const wordsCollection = db.collection(COLLECTIONS.WORDS);

		// 先从words表中查询对应的单词
		const wordDoc = await wordsCollection.findOne({
			word: { $regex: `^${wordData.word}$`, $options: 'i' }
		});

		const customWordData = {
			...wordData,
			updatedAt: new Date()
		};

		// 保留关联ID
		if (wordDoc && wordDoc._id) {
			customWordData.wordId = wordDoc._id;
		}

		const result = await collection.updateOne(
			{ word: { $regex: `^${wordData.word}$`, $options: 'i' } },
			{ $set: customWordData },
			{ upsert: true }
		);

		// 更新 words 表中该单词的 status -> 设置为 mastered，并标记 isMastered = true
		await wordsCollection.updateOne(
			{ word: { $regex: `^${wordData.word}$`, $options: 'i' } },
			{ $set: { status: 'mastered', isMastered: true } },
			{ upsert: true }
		);

		return {
			isUpdate: result.matchedCount > 0,
			modifiedCount: result.modifiedCount,
			upsertedId: result.upsertedId
		};
	} catch (err) {
		console.error('添加或更新自定义单词失败:', err.message);
		throw err;
	}
}

/**
 * 删除自定义单词
 */
async function deleteCustomWord(wordId) {
	try {
		const db = getDb();
		const collection = db.collection(COLLECTIONS.CUSTOM_WORDS);
		const wordsCollection = db.collection(COLLECTIONS.WORDS);

		const wordDoc = await collection.findOne({ _id: wordId });

		if (wordDoc && wordDoc.word) {
			const result = await collection.deleteOne({ _id: wordId });
			
			// 恢复words表中该单词的status
			await wordsCollection.updateOne(
				{ word: { $regex: `^${wordDoc.word}$`, $options: 'i' } },
				{ $set: { status: 'mastered' } }
			);
			
			return result.deletedCount > 0;
		}

		return false;
	} catch (err) {
		console.error('删除自定义单词失败:', err.message);
		throw err;
	}
}

/**
 * 获取所有自定义单词
 */
async function getCustomWords(options = {}) {
	try {
		console.log('options',options)
		const db = getDb();
		const collection = db.collection(COLLECTIONS.CUSTOM_WORDS);
		const wordsCollection = db.collection(COLLECTIONS.WORDS);

		const page = Math.max(1, parseInt(options.page, 10) || 1);
		const limit = Math.max(1, parseInt(options.limit, 10) || 12);
		const skip = (page - 1) * limit;
		const queryText = (options.query || '').trim();
		const sortOpt = options.sort || 'date-desc';
		const hideMastered = !!options.hideMastered;

		const pipeline = [];

		// lookup word data
		pipeline.push({
			$lookup: {
				from: COLLECTIONS.WORDS,
				localField: 'wordId',
				foreignField: '_id',
				as: 'wordData'
			}
		});
		pipeline.push({ $unwind: { path: '$wordData', preserveNullAndEmptyArrays: true } });

		// build match conditions
		const match = {};
		if (queryText) {
			match.$or = [
				{ word: { $regex: queryText, $options: 'i' } },
				{ 'translations.translation': { $regex: queryText, $options: 'i' } }
			];
		}
		if (hideMastered) {
			match['wordData.status'] = { $ne: 'mastered' };
		}
		if (Object.keys(match).length) pipeline.push({ $match: match });

		// projection
		pipeline.push({
			$project: {
				_id: 1,
				word: 1,
				wordId: 1,
				us: 1,
				uk: 1,
				translations: 1,
				sentences: 1,
				source: 1,
				createdAt: 1,
				updatedAt: 1,
				status: '$wordData.status',
				isMastered: '$wordData.isMastered',
				tags: '$wordData.tags'
			}
		});

		// sorting
		const sortStage = {};
		if (sortOpt === 'alpha') sortStage.word = 1;
		else if (sortOpt === 'alpha-reverse') sortStage.word = -1;
		else if (sortOpt === 'date-asc') sortStage.createdAt = 1;
		else sortStage.createdAt = -1; // default date-desc

		pipeline.push({ $sort: sortStage });

		// count total via facet to avoid running pipeline twice
		const facetPipeline = [
			{ $facet: { data: [ { $skip: skip }, { $limit: limit } ], total: [ { $count: 'count' } ] } }
		];

		const fullPipeline = pipeline.concat(facetPipeline);

		const aggRes = await collection.aggregate(fullPipeline).toArray();

		const data = (aggRes[0] && aggRes[0].data) || [];
		const totalCount = (aggRes[0] && aggRes[0].total && aggRes[0].total[0] && aggRes[0].total[0].count) || 0;

		// map fields and merge translations from wordData if missing
		const items = data.map(doc => ({
			...doc,
			translations: doc.translations || (doc.wordData && doc.wordData.translations) || [],
			tags: (doc.tags || (doc.wordData && doc.wordData.tags)) || [],
			status: (doc.status || (doc.wordData && doc.wordData.status)) || null,
			isMastered: !!(doc.isMastered || (doc.wordData && doc.wordData.isMastered))
		}));

		// optional: compute mastered total separately if requested
		let masteredTotal = null;
		try {
			if (hideMastered === false) {
				// count mastered in words collection for speed
				masteredTotal = await wordsCollection.countDocuments({ status: 'mastered' });
			}
		} catch (e) {
			// ignore
		}

		return {
			items,
			total: totalCount,
			page,
			limit,
			masteredTotal
		};
	} catch (err) {
		console.error('获取自定义单词失败:', err.message);
		throw err;
	}
}

// 统计自定义单词数量
async function countCustomWordsAndMasteredWords() {
	try {
		const db = getDb();
		const customWordsCollection = db.collection(COLLECTIONS.CUSTOM_WORDS);
		const masteredWordsCollection = db.collection(COLLECTIONS.WORD_MASTERED);
		const customWordsCount = await customWordsCollection.countDocuments();
		const masteredWordsCount = await masteredWordsCollection.countDocuments();
		return {
			customWordsCount,
			masteredWordsCount
		};
	} catch (err) {
		console.error('统计自定义单词数量失败:', err.message);
		throw err;
	}
}


module.exports = {
	addOrUpdateCustomWord,
	deleteCustomWord,
	getCustomWords,
	countCustomWordsAndMasteredWords
};
