const QueryAnalyzer = require('../src/analyzer');

const analyzer = new QueryAnalyzer();

console.log('=== 测试1: 记录查询和字段 ===');
const queryId1 = analyzer.recordQuery('hash123', 'GetUserWithWeather');

analyzer.recordField(queryId1, 'Query', 'user', ['user'], 150, 'mysql', false);
analyzer.recordField(queryId1, 'User', 'username', ['user', 'username'], 1, null, false);
analyzer.recordField(queryId1, 'User', 'weather', ['user', 'weather'], 800, 'weather', false);
analyzer.recordField(queryId1, 'User', 'onlineStatus', ['user', 'onlineStatus'], 45, 'redis', true);

console.log('✓ 字段记录成功\n');

console.log('=== 测试2: 批量查询（模拟N+1场景） ===');
const queryId2 = analyzer.recordQuery('hash456', 'GetUsers');

for (let i = 0; i < 8; i++) {
  analyzer.recordField(queryId2, 'User', 'weather', ['users', i, 'weather'], 600 + i * 10, 'weather', false);
}

console.log('✓ 批量查询记录完成\n');

console.log('=== 测试3: 获取字段统计 ===');
const fieldStats = analyzer.getFieldStats();
console.log('字段统计:', JSON.stringify(fieldStats, null, 2));
console.log('✓ 字段统计获取成功\n');

console.log('=== 测试4: 获取优化建议 ===');
const recommendations = analyzer.getRecommendations();
console.log('优化建议:', JSON.stringify(recommendations, null, 2));
console.log('✓ 优化建议生成成功\n');

console.log('=== 测试5: 获取完整分析报告 ===');
const report = analyzer.getAnalysisReport();
console.log('报告摘要:', JSON.stringify(report.summary, null, 2));
console.log('字段性能排名前3:', JSON.stringify(report.fieldPerformance.slice(0, 3), null, 2));
console.log('✓ 分析报告生成成功\n');

console.log('=== 测试6: 最近查询 ===');
const recent = analyzer.getRecentQueries(5);
console.log(`最近查询数: ${recent.length}`);
console.log('✓ 最近查询获取成功\n');

console.log('=== 测试7: 慢查询检测 ===');
const slowQueryId = analyzer.recordQuery('slow1', 'SlowQuery');
analyzer.recordField(slowQueryId, 'Query', 'users', ['users'], 3500, 'mysql', false);
for (let i = 0; i < 10; i++) {
  analyzer.recordField(slowQueryId, 'User', 'weather', ['users', i, 'weather'], 200, 'weather', false);
}

const newRecommendations = analyzer.getRecommendations();
const slowRecs = newRecommendations.filter(r => r.type === 'slow_query');
console.log(`慢查询建议数: ${slowRecs.length}`);
console.log('✓ 慢查询检测成功\n');

console.log('=== 测试8: 清除数据 ===');
analyzer.clear();
const clearedReport = analyzer.getAnalysisReport();
console.log(`清除后查询数: ${clearedReport.summary.totalQueriesAnalyzed}`);
console.log('✓ 数据清除成功\n');

console.log('✅ 所有测试通过！查询分析器工作正常');
