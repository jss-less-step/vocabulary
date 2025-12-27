const Service = require('node-windows').Service;
const path = require('path');

// 创建服务对象（配置需要与安装时一致）
const svc = new Service({
  name: 'EnglishVocabularyBackend',
    script: path.join(__dirname, '..', 'src', 'server.js'),
});

// 监听卸载事件
svc.on('uninstall', function() {
  console.log('✓ 服务已成功卸载！');
  console.log('  服务名称: EnglishVocabularyBackend');
  console.log('\n如需重新安装，运行: npm run install-service');
});

svc.on('alreadyuninstalled', function() {
  console.log('⚠ 服务尚未安装或已被卸载。');
});

svc.on('error', function(err) {
  console.error('✗ 卸载失败:', err);
  console.log('\n请确保:');
  console.log('  1. 以管理员身份运行命令提示符或 PowerShell');
  console.log('  2. 服务确实已经安装');
  console.log('  3. 如果服务正在运行，请先停止它');
});

console.log('正在卸载 Windows 服务...');
console.log('提示: 需要管理员权限，请以管理员身份运行此脚本。\n');

// 卸载服务
svc.uninstall();
