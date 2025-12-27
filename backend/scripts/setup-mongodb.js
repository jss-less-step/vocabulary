#!/usr/bin/env node

/**
 * MongoDB 集成快速启动脚本
 * 用途: 一键安装 MongoDB 驱动 + 初始化数据库
 * 运行: npm run setup-mongodb 或 node backend/setup-mongodb.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('\n🚀 MongoDB 集成快速启动\n');

// Step 1: 检查 MongoDB 连接配置
console.log('📋 步骤 1: 检查配置...');
try {
  const dbPath = path.join(__dirname, 'db.js');
  if (!fs.existsSync(dbPath)) {
    console.error('❌ 找不到 backend/db.js 文件');
    console.log('   请确保已完成 MongoDB 模块创建');
    process.exit(1);
  }
  console.log('✅ MongoDB 模块已就位');
} catch (err) {
  console.error('❌ 检查失败:', err.message);
  process.exit(1);
}

// Step 2: 安装 MongoDB 驱动
console.log('\n📦 步骤 2: 安装 MongoDB 驱动...');
try {
  console.log('   执行: npm install mongodb');
  execSync('npm install mongodb', {
    cwd: __dirname,
    stdio: 'inherit'
  });
  console.log('✅ MongoDB 驱动安装成功');
} catch (err) {
  console.error('❌ 安装失败。请手动运行:');
  console.error('   cd backend');
  console.error('   npm install mongodb');
  process.exit(1);
}

// Step 3: 初始化数据库
console.log('\n🗄️  步骤 3: 初始化数据库...');
console.log('   执行: node init-mongodb.js\n');

try {
  require('./init-mongodb');
} catch (err) {
  if (err.code === 'MODULE_NOT_FOUND') {
    console.error('❌ 找不到 init-mongodb.js 文件');
    console.error('   请确保已创建初始化脚本');
  } else {
    console.error('❌ 初始化失败:', err.message);
    console.log('\n💡 故障排查:');
    console.log('   1. 检查 MongoDB 是否运行');
    console.log('   2. 检查连接字符串是否正确');
    console.log('   3. 检查用户名/密码是否正确');
  }
  process.exit(1);
}

console.log('\n✨ MongoDB 集成完成！\n');
console.log('📝 后续步骤:');
console.log('   1. 启动服务器: npm start');
console.log('   2. 查看统计: curl http://localhost:3000/db-stats');
console.log('   3. 获取词汇: curl http://localhost:3000/vocabulary?limit=10\n');
