#!/usr/bin/env node

/**
 * 系统诊断脚本
 * 用途: 检查 MongoDB 集成的各个环节
 * 运行: node backend/diagnose.js 或 npm run diagnose
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(level, message) {
  const prefix = {
    '✅': colors.green + '✅' + colors.reset,
    '❌': colors.red + '❌' + colors.reset,
    '⚠️': colors.yellow + '⚠️' + colors.reset,
    '📋': colors.blue + '📋' + colors.reset,
    'ℹ️': colors.cyan + 'ℹ️' + colors.reset
  };
  console.log(`${prefix[level]} ${message}`);
}

async function checkFile(filePath, description) {
  return new Promise(resolve => {
    if (fs.existsSync(filePath)) {
      const size = fs.statSync(filePath).size;
      const sizeStr = size > 1024 * 1024 
        ? `${(size / 1024 / 1024).toFixed(2)}MB`
        : size > 1024
          ? `${(size / 1024).toFixed(2)}KB`
          : `${size}B`;
      log('✅', `${description} (${sizeStr})`);
      resolve(true);
    } else {
      log('❌', `${description} 不存在`);
      resolve(false);
    }
  });
}

async function checkMongoDBModule() {
  return new Promise(resolve => {
    try {
      require.resolve('mongodb');
      log('✅', 'MongoDB 驱动已安装');
      resolve(true);
    } catch (err) {
      log('❌', 'MongoDB 驱动未安装');
      log('ℹ️', '  运行: npm install mongodb');
      resolve(false);
    }
  });
}

async function checkMongoDBConnection() {
  return new Promise(async resolve => {
    try {
      const { MongoClient } = require('mongodb');
      const uri = 'mongodb://jss12138:123456@localhost:27017/lessStep?retryWrites=true&authSource=lessStep&authMechanism=SCRAM-SHA-1';
      
      const client = new MongoClient(uri, { 
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000
      });
      
      await client.connect();
      
      const collections = await client.db('lessStep').listCollections().toArray();
      const collectionNames = collections.map(c => c.name);
      
      log('✅', 'MongoDB 连接成功');
      log('ℹ️', `  集合: ${collectionNames.join(', ') || '(无)'}`);
      
      // 检查数据
      const wordsCount = await client.db('lessStep').collection('words').countDocuments();
      log('ℹ️', `  预设词汇: ${wordsCount} 个`);
      
      await client.close();
      resolve(true);
    } catch (err) {
      log('❌', 'MongoDB 连接失败');
      log('ℹ️', `  错误: ${err.message}`);
      log('ℹ️', '  检查清单:');
      log('ℹ️', '    1. MongoDB 服务是否运行?');
      log('ℹ️', '    2. 连接字符串是否正确?');
      log('ℹ️', '    3. 用户名/密码是否正确?');
      resolve(false);
    }
  });
}

async function checkServer() {
  return new Promise(resolve => {
    const req = http.get('http://localhost:3000/db-stats', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          log('✅', '服务器运行中');
          log('ℹ️', `  预设词汇: ${json.wordsCount} 个`);
          log('ℹ️', `  自定义词汇: ${json.customWordsCount} 个`);
          log('ℹ️', `  MongoDB: ${json.connected ? '已连接' : '未连接'}`);
          resolve(true);
        } catch (err) {
          log('❌', '无法读取服务器数据');
          resolve(false);
        }
      });
    });
    
    req.on('error', () => {
      log('❌', '服务器未运行 (http://localhost:3000)');
      log('ℹ️', '  运行: npm start');
      resolve(false);
    });
    
    req.setTimeout(5000, () => {
      req.destroy();
      log('❌', '服务器连接超时');
      resolve(false);
    });
  });
}

async function diagnose() {
  console.log('\n');
  console.log(colors.cyan + '════════════════════════════════════════════' + colors.reset);
  console.log(colors.cyan + '  MongoDB 集成系统诊断' + colors.reset);
  console.log(colors.cyan + '════════════════════════════════════════════' + colors.reset);
  console.log();

  log('📋', '检查文件结构...');
  console.log();

  const backendDir = __dirname;
  const rootDir = path.dirname(backendDir);

  const fileChecks = [
    checkFile(path.join(backendDir, 'db.js'), '1. MongoDB 模块'),
    checkFile(path.join(backendDir, 'server.js'), '2. 服务器'),
    checkFile(path.join(backendDir, 'init-mongodb.js'), '3. 初始化脚本'),
    checkFile(path.join(backendDir, 'setup-mongodb.js'), '4. 一键安装脚本'),
    checkFile(path.join(backendDir, 'merged-vocabulary.json'), '5. 词汇数据'),
    checkFile(path.join(backendDir, 'package.json'), '6. 包配置'),
    checkFile(path.join(backendDir, 'MONGODB_GUIDE.md'), '7. MongoDB 指南'),
  ];

  const fileResults = await Promise.all(fileChecks);
  console.log();

  log('📋', '检查依赖...');
  console.log();
  const mongoInstalled = await checkMongoDBModule();
  console.log();

  log('📋', '检查数据库连接...');
  console.log();
  const mongoConnected = mongoInstalled ? await checkMongoDBConnection() : false;
  console.log();

  log('📋', '检查服务器...');
  console.log();
  const serverRunning = await checkServer();
  console.log();

  // 总结
  console.log(colors.cyan + '════════════════════════════════════════════' + colors.reset);
  console.log(colors.cyan + '  诊断总结' + colors.reset);
  console.log(colors.cyan + '════════════════════════════════════════════' + colors.reset);
  console.log();

  const allFilesOk = fileResults.every(r => r);
  const status = allFilesOk && mongoInstalled && mongoConnected && serverRunning
    ? '✅ 系统正常'
    : allFilesOk && mongoInstalled
      ? '⚠️ 部分功能未启用'
      : allFilesOk
        ? '⚠️ 缺少依赖'
        : '❌ 文件不完整';

  log('ℹ️', status);
  console.log();

  if (!allFilesOk) {
    log('ℹ️', '检测到缺失的文件。这可能表示 MongoDB 集成不完整。');
    log('ℹ️', '请确保所有文件都已创建。');
  }

  if (allFilesOk && !mongoInstalled) {
    log('ℹ️', '快速启动步骤:');
    log('ℹ️', '  1. npm install mongodb');
    log('ℹ️', '  2. npm run init-mongodb');
    log('ℹ️', '  3. npm start');
  }

  if (mongoInstalled && !mongoConnected) {
    log('ℹ️', '快速启动步骤:');
    log('ℹ️', '  1. 确认 MongoDB 服务运行');
    log('ℹ️', '  2. npm run init-mongodb');
    log('ℹ️', '  3. npm start');
  }

  if (serverRunning) {
    log('ℹ️', '系统已就绪！');
    log('ℹ️', '访问: http://localhost:3000');
  }

  console.log();
}

// 运行诊断
diagnose().catch(err => {
  console.error('诊断失败:', err);
  process.exit(1);
});
