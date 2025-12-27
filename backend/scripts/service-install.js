const Service = require('node-windows').Service;
const path = require('path');

// 创建一个新的服务对象
const svc = new Service({
  name: 'EnglishVocabularyBackend',
  description: 'English Vocabulary Chrome Extension Backend Server',
  script: path.join(__dirname, '..', 'src', 'server.js'),
  nodeOptions: [
    '--harmony',
    '--max_old_space_size=4096'
  ],
  env: [
    {
      name: "NODE_ENV",
      value: "production"
    },
    {
      name: "PORT",
      value: "3000"
    }
  ]
});

// 监听安装事件
svc.on('install', function() {
  console.log('✓ 服务安装成功！');
  console.log('  服务名称: EnglishVocabularyBackend');
  console.log('  监听端口: http://localhost:3000');
  console.log('\n正在启动服务...');
  svc.start();
});

svc.on('start', function() {
  console.log('✓ 服务已启动！');
  console.log('\n服务管理命令:');
  console.log('  查看状态: services.msc (搜索 EnglishVocabularyBackend)');
  console.log('  停止服务: net stop EnglishVocabularyBackend');
  console.log('  启动服务: net start EnglishVocabularyBackend');
  console.log('  卸载服务: npm run uninstall-service');
  console.log('\n服务已设置为开机自动启动！');
});

svc.on('alreadyinstalled', function() {
  console.log('⚠ 服务已经安装过了。');
  console.log('  如需重新安装，请先运行: npm run uninstall-service');
});

svc.on('error', function(err) {
  console.error('✗ 安装失败:', err);
  console.log('\n请确保:');
  console.log('  1. 以管理员身份运行命令提示符或 PowerShell');
  console.log('  2. 已安装 node-windows: npm install');
  console.log('  3. 没有其他程序占用端口 3000');
});

// 检查是否以管理员身份运行
console.log('正在安装 Windows 服务...');
console.log('提示: 需要管理员权限，请以管理员身份运行此脚本。\n');

// 安装服务
svc.install();
