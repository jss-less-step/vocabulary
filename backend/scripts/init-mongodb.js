/**
 * MongoDB 初始化脚本
 * 
 * 用途：初次设置时运行此脚本
 * 1. 导入 merged-vocabulary.json 到 MongoDB
 * 2. 创建必要的索引
 * 3. 验证连接
 * 
 * 使用: node backend/init-mongodb.js
 */

const db = require('./db');
const fs = require('fs');
const path = require('path');

async function init() {
  console.log('🚀 开始 MongoDB 初始化...\n');
  
  try {
    // 1. 连接数据库
    console.log('1️⃣  正在连接 MongoDB...');
    await db.connect();
    console.log('✅ 连接成功\n');
    
    // 2. 导入词汇数据
    console.log('2️⃣  正在导入词汇数据...');
    await db.importVocabularyFromJson();
    console.log('✅ 导入完成\n');
    
    // 3. 获取统计信息
    console.log('3️⃣  获取数据库统计...');
    const stats = await db.getStats();
    console.log(`✅ 统计信息:`);
    console.log(`   - 预设词汇: ${stats.wordsCount} 个`);
    console.log(`   - 自定义词汇: ${stats.customWordsCount} 个`);
    console.log(`   - 总计: ${stats.totalWords} 个\n`);
    
    // 4. 测试搜索功能
    console.log('4️⃣  测试搜索功能...');
    const testWord = await db.searchWord('hello');
    if (testWord) {
      console.log(`✅ 搜索成功: ${testWord.word}`);
      console.log(`   翻译: ${testWord.translations?.[0]?.translation || '无'}\n`);
    } else {
      console.log('⚠️  未找到测试单词\n');
    }
    
    // 5. 测试标签过滤
    console.log('5️⃣  测试标签过滤...');
    const learningWords = await db.getWordsByTag('learning');
    console.log(`✅ 找到 ${learningWords.length} 个 learning 标签的单词\n`);
    
    console.log('🎉 初始化完成！');
    console.log('\n📝 下一步：');
    console.log('1. 安装依赖: npm install mongodb');
    console.log('2. 启动服务: npm start');
    console.log('3. 访问: http://localhost:3000\n');
    
  } catch (err) {
    console.error('❌ 初始化失败:', err.message);
    process.exit(1);
  } finally {
    await db.disconnect();
  }
}

init();
