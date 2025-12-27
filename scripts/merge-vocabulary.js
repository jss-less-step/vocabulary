/**
 * 合并 json-full 目录下所有单词，去重并添加分类标签
 * 
 * 功能：
 * 1. 读取 json-full 目录下所有 JSON 文件
 * 2. 提取分类名（文件名去掉数字后缀）
 * 3. 按单词去重合并
 * 4. 添加 tags 数组标识单词所属分类
 * 5. 输出到 merged-vocabulary.json
 */

const fs = require('fs');
const path = require('path');

// 路径配置
const JSON_FULL_DIR = path.join(__dirname, '../json_original/json-full');
const OUTPUT_FILE = path.join(__dirname, '../filtered_json/merged-vocabulary.json');

// 提取分类名（去掉数字和下划线后缀）
function extractCategory(filename) {
  // 移除 .json 后缀
  const name = filename.replace(/\.json$/i, '');
  
  // 去掉末尾的数字和下划线
  // 例如: PEPXiaoXue3_1 -> PEPXiaoXue
  //      CET4_1 -> CET4
  //      BeiShiGaoZhong_1 -> BeiShiGaoZhong
  const category = name.replace(/[_\d]+$/g, '');
  
  return category;
}

// 规范化单词数据格式
function normalizeWordData(item) {
  // 如果是 json-full 格式，需要提取 content
  if (item.content && item.content.word) {
    const content = item.content.word.content || {};
    return {
      word: item.headWord || item.content.word.wordHead || '',
      us: content.usphone || '',
      uk: content.ukphone || '',
      translations: (content.trans || []).map(t => ({
        translation: t.tranCn || '',
        type: t.pos || ''
      })),
      phrases: (content.phrase?.phrases || []).map(p => ({
        phrase: p.pContent || '',
        translation: p.pCn || ''
      })),
      sentences: (content.sentence?.sentences || []).map(s => ({
        sentence: s.sContent || '',
        translation: s.sCn || ''
      })),
      remMethod: content.remMethod?.val || ''
    };
  }
  
  // 已经是简化格式，直接返回
  return {
    word: item.word || '',
    us: item.us || '',
    uk: item.uk || '',
    translations: item.translations || [],
    phrases: item.phrases || [],
    sentences: item.sentences || [],
    remMethod: item.remMethod || ''
  };
}

// 合并单词数据（当同一个单词在多个分类中出现时）
function mergeWordData(existing, newData) {
  // 优先使用更完整的数据
  return {
    word: existing.word || newData.word,
    us: existing.us || newData.us,
    uk: existing.uk || newData.uk,
    translations: mergeArrays(existing.translations, newData.translations, 'translation'),
    phrases: mergeArrays(existing.phrases, newData.phrases, 'phrase'),
    sentences: mergeArrays(existing.sentences, newData.sentences, 'sentence'),
    remMethod: existing.remMethod || newData.remMethod,
    tags: existing.tags || []
  };
}

// 合并数组（去重）
function mergeArrays(arr1, arr2, key) {
  const map = new Map();
  
  // 添加第一个数组的项
  (arr1 || []).forEach(item => {
    if (item && item[key]) {
      map.set(item[key].toLowerCase(), item);
    }
  });
  
  // 添加第二个数组的项
  (arr2 || []).forEach(item => {
    if (item && item[key]) {
      const k = item[key].toLowerCase();
      if (!map.has(k)) {
        map.set(k, item);
      }
    }
  });
  
  return Array.from(map.values());
}

async function mergeVocabulary() {
  console.log('开始合并词汇...');
  console.log(`读取目录: ${JSON_FULL_DIR}`);
  
  // 读取所有 JSON 文件
  const files = fs.readdirSync(JSON_FULL_DIR)
    .filter(f => f.endsWith('.json'))
    .sort();
  
  console.log(`找到 ${files.length} 个 JSON 文件`);
  
  // 单词映射表 (word.toLowerCase() -> wordData)
  const wordMap = new Map();
  
  // 统计信息
  let totalWords = 0;
  let processedFiles = 0;
  
  // 处理每个文件
  for (const filename of files) {
    try {
      const category = extractCategory(filename);
      const filePath = path.join(JSON_FULL_DIR, filename);
      const content = fs.readFileSync(filePath, 'utf-8');
      const words = JSON.parse(content);
      
      if (!Array.isArray(words)) {
        console.warn(`  ⚠️  ${filename}: 不是数组格式，跳过`);
        continue;
      }
      
      let fileWordCount = 0;
      
      for (const item of words) {
        const normalized = normalizeWordData(item);
        const word = normalized.word.trim();
        
        if (!word) continue;
        
        const key = word.toLowerCase();
        
        if (wordMap.has(key)) {
          // 单词已存在，合并数据并添加标签
          const existing = wordMap.get(key);
          const merged = mergeWordData(existing, normalized);
          
          // 添加分类标签（去重）
          if (!merged.tags.includes(category)) {
            merged.tags.push(category);
          }
          
          wordMap.set(key, merged);
        } else {
          // 新单词，添加第一个标签
          normalized.tags = [category];
          wordMap.set(key, normalized);
          fileWordCount++;
        }
        
        totalWords++;
      }
      
      processedFiles++;
      console.log(`  ✓ ${filename} -> ${category} (${fileWordCount} 个新单词)`);
      
    } catch (err) {
      console.error(`  ✗ ${filename}: ${err.message}`);
    }
  }
  
  // 转换为数组并排序
  const mergedWords = Array.from(wordMap.values())
    .sort((a, b) => a.word.localeCompare(b.word));
  
  // 写入输出文件
  console.log(`\n写入输出文件: ${OUTPUT_FILE}`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(mergedWords, null, 2), 'utf-8');
  
  // 输出统计信息
  console.log('\n=== 合并完成 ===');
  console.log(`处理文件: ${processedFiles}/${files.length}`);
  console.log(`总单词数（含重复）: ${totalWords}`);
  console.log(`去重后单词数: ${mergedWords.length}`);
  console.log(`输出文件: ${OUTPUT_FILE}`);
  
  // 分类统计
  console.log('\n=== 分类统计 ===');
  const categoryStats = {};
  mergedWords.forEach(word => {
    word.tags.forEach(tag => {
      categoryStats[tag] = (categoryStats[tag] || 0) + 1;
    });
  });
  
  const sortedCategories = Object.entries(categoryStats)
    .sort((a, b) => b[1] - a[1]);
  
  sortedCategories.forEach(([category, count]) => {
    console.log(`  ${category}: ${count} 个单词`);
  });
  
  // 跨分类统计
  console.log('\n=== 跨分类统计 ===');
  const crossCategoryStats = {};
  mergedWords.forEach(word => {
    const tagCount = word.tags.length;
    crossCategoryStats[tagCount] = (crossCategoryStats[tagCount] || 0) + 1;
  });
  
  Object.entries(crossCategoryStats)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .forEach(([count, words]) => {
      console.log(`  出现在 ${count} 个分类: ${words} 个单词`);
    });
  
  console.log('\n完成！');
}

// 执行合并
mergeVocabulary().catch(err => {
  console.error('合并失败:', err);
  process.exit(1);
});
