const dpiManager = require('./src/utils/DPIManager');

console.log('=== DPI 管理器测试 ===\n');

const screenInfo = dpiManager.getScreenInfo();
console.log('当前屏幕信息:');
console.log('  缩放比例:', screenInfo.scaleFactor);
console.log('  逻辑分辨率:', screenInfo.logicalWidth + 'x' + screenInfo.logicalHeight);
console.log('  物理分辨率:', screenInfo.physicalWidth + 'x' + screenInfo.physicalHeight);

console.log('\n坐标转换测试:');

const testLogicalX = 100;
const testLogicalY = 100;

const physical = dpiManager.logicalToPhysical(testLogicalX, testLogicalY);
console.log(`逻辑坐标 (${testLogicalX}, ${testLogicalY}) -> 物理坐标 (${physical.x}, ${physical.y})`);

const backToLogical = dpiManager.physicalToLogical(physical.x, physical.y);
console.log(`物理坐标 (${physical.x}, ${physical.y}) -> 逻辑坐标 (${backToLogical.x}, ${backToLogical.y})`);

console.log('\n跨DPI回放测试:');
const recordedScale = 1.5;
const currentScale = 1.0;
const recordedX = 150;
const recordedY = 150;

const converted = dpiManager.convertForReplayWithInfo(recordedX, recordedY, recordedScale, currentScale);
console.log(`录制坐标 (${recordedX}, ${recordedY}) @ ${recordedScale}x -> 回放坐标 (${converted.x}, ${converted.y}) @ ${currentScale}x`);

console.log('\n=== 测试完成 ===');
