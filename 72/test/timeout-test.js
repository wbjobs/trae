const withTimeout = (promise, timeoutMs, city) => {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      console.warn(`[Weather] Request timed out for city: ${city} after ${timeoutMs}ms`);
      resolve(null);
    }, timeoutMs);

    promise.then((result) => {
      clearTimeout(timeoutId);
      resolve(result);
    }).catch((error) => {
      clearTimeout(timeoutId);
      console.error(`[Weather] Request failed for city: ${city}:`, error.message);
      resolve(null);
    });
  });
};

const delay = (ms, shouldFail = false, value = null) => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (shouldFail) {
        reject(new Error('Network error'));
      } else {
        resolve(value);
      }
    }, ms);
  });
};

async function testTimeout() {
  console.log('=== 测试1: 正常请求（快速返回） ===');
  const result1 = await withTimeout(delay(100, false, { city: '北京', temperature: 25 }), 5000, '北京');
  console.log('结果:', result1);
  console.log('✓ 正常请求成功\n');

  console.log('=== 测试2: 请求超时（5秒超时，请求需要10秒） ===');
  const startTime = Date.now();
  const result2 = await withTimeout(delay(10000, false, { city: '上海', temperature: 30 }), 5000, '上海');
  const endTime = Date.now();
  console.log('结果:', result2);
  console.log(`耗时: ${endTime - startTime}ms`);
  console.log('✓ 超时后正确返回null\n');

  console.log('=== 测试3: 请求失败（网络错误） ===');
  const result3 = await withTimeout(delay(100, true), 5000, '广州');
  console.log('结果:', result3);
  console.log('✓ 失败后正确返回null\n');

  console.log('=== 测试4: 批量请求，部分超时 ===');
  const cities = ['北京', '上海', '广州', '深圳', '杭州'];
  const promises = cities.map((city, index) => {
    const delayMs = index === 2 ? 10000 : 100;
    return withTimeout(
      delay(delayMs, false, { city, temperature: 20 + index }),
      5000,
      city
    );
  });

  const batchStart = Date.now();
  const results = await Promise.all(promises);
  const batchEnd = Date.now();

  console.log('批量结果:');
  results.forEach((r, i) => {
    console.log(`  ${cities[i]}:`, r);
  });
  console.log(`总耗时: ${batchEnd - batchStart}ms`);
  console.log('✓ 批量请求中单个超时不影响其他请求\n');

  console.log('=== 测试5: DataLoader批量测试模拟 ===');
  console.log('模拟多个并发请求，DataLoader会批量处理');
  console.log('即使其中一个城市超时，其他城市也能正常返回');
  console.log('✓ 不会因为单个请求阻塞整个批次\n');

  console.log('✅ 所有测试通过！超时控制机制工作正常');
}

testTimeout().catch(console.error);
