/**
 * 标记 learning.json 中的单词在 merged-vocabulary.json 中
 * 
 * 功能：
 * 1. 读取 backend/learning.json 文件
 * 2. 读取 backend/merged-vocabulary.json 文件
 * 3. 为 merged-vocabulary.json 中出现在 learning.json 的单词添加 isLearning: true 标记
 * 4. 写回 merged-vocabulary.json
 */

const fs = require('fs');
const path = require('path');

// 路径配置
const LEARNING_PATH = path.join(__dirname, '../backend/learning.json');
const MERGED_VOCABULARY_PATH = path.join(__dirname, '../backend/merged-vocabulary.json');

async function markLearningWords() {
  console.log('开始标记学习中的单词...\n');
  
  // 读取 learning.json
  console.log(`读取学习词表: ${LEARNING_PATH}`);
  let learningWords = [];
  try {
    const learningData = fs.readFileSync(LEARNING_PATH, 'utf-8');
    learningWords = JSON.parse(learningData);
    console.log(`  ✓ 找到 ${learningWords.length} 个学习中的单词\n`);
  } catch (err) {
    console.error('  ✗ 读取 learning.json 失败:', err.message);
    process.exit(1);
  }
  
  // 构建学习单词的 Set（不区分大小写）
  const learningSet = new Set(
    learningWords.map(w => (w.word || '').toLowerCase().trim()).filter(Boolean)
  );
  console.log(`  构建学习单词索引: ${learningSet.size} 个唯一单词\n`);
  
  // 读取 merged-vocabulary.json
  console.log(`读取合并词库: ${MERGED_VOCABULARY_PATH}`);
  let mergedWords = [];
  try {
    const mergedData = fs.readFileSync(MERGED_VOCABULARY_PATH, 'utf-8');
    mergedWords = JSON.parse(mergedData);
    console.log(`  ✓ 找到 ${mergedWords.length} 个单词\n`);
  } catch (err) {
    console.error('  ✗ 读取 merged-vocabulary.json 失败:', err.message);
    process.exit(1);
  }
  
  // 标记学习中的单词
  console.log('标记学习中的单词...');
  let markedCount = 0;
  let alreadyMarkedCount = 0;
  
  mergedWords.forEach((word, index) => {
    if (!word.word) return;
    
    const wordKey = word.word.toLowerCase().trim();
    const isLearning = learningSet.has(wordKey);
    
    // 确保 tags 数组存在
    if (!word.tags) {
      word.tags = [];
    }
    
    const hasLearningTag = word.tags.includes('learning');
    
    if (isLearning) {
      if (hasLearningTag) {
        alreadyMarkedCount++;
      } else {
        word.tags.push('learning');
        markedCount++;
      }
    } else {
      // 移除非学习单词的 learning 标记（如果有）
      if (hasLearningTag) {
        word.tags = word.tags.filter(tag => tag !== 'learning');
      }
    }
    
    // 进度提示（每 1000 个单词）
    if ((index + 1) % 1000 === 0) {
      process.stdout.write(`  处理进度: ${index + 1}/${mergedWords.length}\r`);
    }
  });
  
  console.log(`  处理进度: ${mergedWords.length}/${mergedWords.length} - 完成`);
  console.log(`  ✓ 新标记: ${markedCount} 个单词`);
  console.log(`  ℹ 已标记: ${alreadyMarkedCount} 个单词\n`);
  
  // 写回文件
  console.log(`写入更新后的词库: ${MERGED_VOCABULARY_PATH}`);
  try {
    fs.writeFileSync(
      MERGED_VOCABULARY_PATH, 
      JSON.stringify(mergedWords, null, 2), 
      'utf-8'
    );
    console.log('  ✓ 写入成功\n');
  } catch (err) {
    console.error('  ✗ 写入失败:', err.message);
    process.exit(1);
  }
  
  // 统计信息
  console.log('=== 标记完成 ===');
  console.log(`合并词库总数: ${mergedWords.length}`);
  console.log(`学习词表总数: ${learningSet.size}`);
  console.log(`新增标记: ${markedCount}`);
  console.log(`已有标记: ${alreadyMarkedCount}`);
  console.log(`标记总数: ${markedCount + alreadyMarkedCount}`);
  
  // 验证统计
  const learningCount = mergedWords.filter(w => w.tags && w.tags.includes('learning')).length;
  console.log(`\n验证: merged-vocabulary.json 中共有 ${learningCount} 个单词标记为学习中`);
  
  console.log('\n完成！');
}

// 执行标记
markLearningWords().catch(err => {
  console.error('标记失败:', err);
  process.exit(1);
});
