const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

// MongoDB 数据库模块
let db = null;
try {
  db = require('./db');
} catch (err) {
  console.error('❌ 无法加载数据库模块:', err.message);
  process.exit(1);
}

// 导入工具函数
const { setCors, sendJson } = require('./utils/httpUtils');

// 导入所有 Controller
const vocabularyController = require('./controller/vocabularyController');
const customWordsController = require('./controller/customWordsController');
const statsController = require('./controller/statsController');
const pageContentController = require('./controller/pageContentController');
const translateController = require('./controller/translateController');

// 导入 Service
const wordStatsService = require('./service/wordStatsService');

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  setCors(res);
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const { pathname } = parsedUrl;
  const query = parsedUrl.query;

  try {
    // ============ 词汇相关路由 ============
    if (pathname === '/tags' && req.method === 'GET') {
      return await vocabularyController.getAllTags(req, res);
    }

    if (pathname === '/search-word' && req.method === 'GET') {
      return await vocabularyController.searchWord(req, res, query);
    }

    // 翻译代理（调用 Google Translate）
    if (pathname === '/translate' && req.method === 'GET') {
      return await translateController.translateText(req, res, query);
    }

    if (pathname === '/vocabulary' && req.method === 'POST') {
      return await vocabularyController.getVocabulary(req, res);
    }

    if (pathname === '/word-mastered' && req.method === 'POST') {
      return await vocabularyController.markWordMastered(req, res);
    }

    if (pathname.startsWith('/word-views/') && req.method === 'GET') {
      return await vocabularyController.getWordViews(req, res, pathname);
    }

    // ============ 自定义单词路由 ============
    if (pathname === '/custom-words' && req.method === 'GET') {
      return await customWordsController.getCustomWords(req, res);
    }

    if (pathname === '/custom-words' && req.method === 'POST') {
      return await customWordsController.addCustomWord(req, res);
    }

    if (pathname.startsWith('/custom-words/') && req.method === 'DELETE') {
      return await customWordsController.deleteCustomWord(req, res, pathname);
    }

    if(pathname === '/custom-words/count' && req.method === 'GET'){
      return await customWordsController.countCustomWordsAndMasteredWords(req, res);
    }

    // ============ 统计路由 ============
    if (pathname === '/mastered-stats' && req.method === 'GET') {
      return await statsController.getAllMasteredStats(req, res);
    }

    if (pathname.startsWith('/mastered-stats/') && req.method === 'GET') {
      return await statsController.getMasteredStatsByTag(req, res, pathname);
    }

    if (pathname === '/recent-learning' && req.method === 'GET') {
      return await statsController.getRecentLearning(req, res, query);
    }

    if (pathname === '/learning-trend' && req.method === 'GET') {
      return await statsController.getLearningTrend(req, res, query);
    }

    if (pathname === '/day-words' && req.method === 'GET') {
      return await statsController.getDayWords(req, res, query);
    }

    if (pathname === '/day-word-stats' && req.method === 'GET') {
      return await statsController.getDayWordStats(req, res, query);
    }

    if (pathname === '/mastered-period' && req.method === 'GET') {
      return await statsController.getMasteredPeriod(req, res, query);
    }

    if (pathname === '/mastered-day-words' && req.method === 'GET') {
      return await statsController.getMasteredDayWords(req, res, query);
    }

    if (pathname === '/overall-stats' && req.method === 'GET') {
      return await statsController.getOverallStats(req, res);
    }

    if (pathname === '/stats-timeline' && req.method === 'GET') {
      return await statsController.getStatsTimeline(req, res, query);
    }

    if (pathname === '/custom-words-timeline' && req.method === 'GET') {
      return await statsController.getCustomWordsTimeline(req, res, query);
    }

    if (pathname === '/stats-by-range' && req.method === 'GET') {
      return await statsController.getStatsByRange(req, res, query);
    }

    if (pathname === '/custom-words-stats-by-range' && req.method === 'GET') {
      return await statsController.getCustomWordsStatsByRange(req, res, query);
    }

    // ============ 页面内容路由 ============
    if (pathname === '/save-page-content' && req.method === 'POST') {
      return await pageContentController.savePageContent(req, res);
    }

    if (pathname === '/page-contents' && req.method === 'GET') {
      return await pageContentController.getPageContents(req, res, query);
    }

    if (pathname.match(/^\/page-contents\/[a-f0-9]+\/detail$/) && req.method === 'GET') {
      return await pageContentController.getPageContentDetail(req, res, pathname);
    }

    if (pathname.match(/^\/page-contents\/[a-f0-9]+\/mark-read$/) && req.method === 'PUT') {
      return await pageContentController.markPageAsRead(req, res, pathname);
    }

    if (pathname.match(/^\/page-contents\/[a-f0-9]+$/) && req.method === 'GET') {
      return await pageContentController.getPageContentById(req, res, pathname);
    }

    if (pathname.startsWith('/page-contents/') && req.method === 'DELETE') {
      return await pageContentController.deletePageContent(req, res, pathname);
    }

    // ============ 兼容旧接口 ============
    if (pathname === '/db-stats' && req.method === 'GET') {
      const stats = await db.getStats();
      return sendJson(res, 200, stats);
    }

    // ============ 数据同步接口 ============
    // POST /sync-word-counts - 同步所有单词的计数（管理员接口）
    if (pathname === '/sync-word-counts' && req.method === 'POST') {
      const result = await wordStatsService.syncWordCounts();
      return sendJson(res, 200, result);
    }

    // ============ BBCNewsArticle ============
    if(pathname === '/fetch-bbc-articles' && req.method === 'GET'){
      const bbcService = require('./service/bbcService');
      bbcService.fetchAndProcessBBCArticle(10000);
      return sendJson(res, 200, { ok: true, message: 'BBC 文章爬取中' });
    }

    // ============ 静态文件服务 ============
    let filePath;
    if (pathname === '/') {
      filePath = path.join(__dirname, '..', '..', 'web', 'index.html');
    } else if (pathname.startsWith('/web/')) {
      filePath = path.join(__dirname, '..', '..', pathname);
    } else {
      filePath = path.join(__dirname, '..', '..', 'web', pathname);
    }
    
    try {
      const stats = fs.statSync(filePath);
      if (stats.isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.json': 'application/json; charset=utf-8',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.gif': 'image/gif',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon'
        };

        const contentType = mimeTypes[ext] || 'application/octet-stream';
        const file = fs.readFileSync(filePath);
        
        setCors(res);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(file);
        return;
      }
    } catch (err) {
      // 文件不存在，继续处理 404
    }

    // ============ 404 ============
    sendJson(res, 404, { error: 'Not Found' });

  } catch (error) {
    console.error('❌ 请求处理错误:', error.message);
    sendJson(res, 500, { error: error.message || 'Internal Server Error' });
  }
});

// 启动服务器
server.listen(PORT, async () => {
  console.log(`\n🚀 服务器运行在 http://localhost:${PORT}\n`);

  try {
    // 连接数据库
    await db.connect();
    
    // 导入词汇数据
    // await db.importVocabularyFromJson();
    
    // 同步所有单词的计数
    // console.log('\n🔄 正在同步单词计数...');
    // await wordStatsService.syncWordCounts();
    // console.log('✓ 单词计数同步完成');
    
    // 获取统计信息
    const stats = await db.getStats();
    console.log('\n📊 数据库统计:');
    console.log(`   - 预设词汇: ${stats.wordsCount} 个`);
    console.log(`   - 自定义词汇: ${stats.customWordsCount} 个`);
    console.log(`   - 总计: ${stats.totalWords} 个\n`);

  } catch (err) {
    console.error('\n❌ 启动失败:', err.message);
    process.exit(1);
  }
});

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n👋 正在关闭服务器...');
  await db.disconnect();
  process.exit(0);
});
