const axios = require('axios');

const BASE_URL = 'http://127.0.0.1:3001/api/v1';
const ADMIN_KEY = 'your_admin_api_key_here';

const headers = {
  'x-api-key': ADMIN_KEY,
  'Content-Type': 'application/json'
};

async function example1_createKey() {
  console.log('\n=== 示例1: 创建 API Key ===');
  try {
    const response = await axios.post(`${BASE_URL}/keys`, {
      name: '测试应用密钥',
      level: 2,
      expireDays: 30,
      metadata: { app: 'test-app', owner: 'dev-team' }
    }, { headers });
    console.log('创建成功:', JSON.stringify(response.data, null, 2));
    return response.data.data.key;
  } catch (error) {
    console.error('创建失败:', error.response?.data || error.message);
  }
}

async function example2_listKeys() {
  console.log('\n=== 示例2: 获取密钥列表 ===');
  try {
    const response = await axios.get(`${BASE_URL}/keys?status=1&limit=10`, { headers });
    console.log('密钥总数:', response.data.data.total);
    console.log('密钥列表:', JSON.stringify(response.data.data.items.slice(0, 3), null, 2));
  } catch (error) {
    console.error('获取失败:', error.response?.data || error.message);
  }
}

async function example3_verifyAuth() {
  console.log('\n=== 示例3: 验证 API Key 鉴权 ===');
  try {
    const testKey = 'ak_test_key_here';
    const response = await axios.get(`${BASE_URL}/auth/verify`, {
      headers: { 'x-api-key': testKey }
    });
    console.log('鉴权结果:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('鉴权失败:', error.response?.data || error.message);
  }
}

async function example4_checkLevelAuth() {
  console.log('\n=== 示例4: 验证分级权限 ===');
  try {
    const testKey = 'ak_test_key_here';
    const requiredLevel = 2;
    const response = await axios.get(`${BASE_URL}/auth/verify/${requiredLevel}`, {
      headers: { 'x-api-key': testKey }
    });
    console.log('权限验证结果:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('权限验证失败:', error.response?.data || error.message);
  }
}

async function example5_addGrayRule() {
  console.log('\n=== 示例5: 添加灰度 IP 规则 ===');
  try {
    const response = await axios.post(`${BASE_URL}/gray/rules`, {
      ipRange: '192.168.1.0/24',
      description: '内部测试网段',
      trafficPercent: 50
    }, { headers });
    console.log('规则添加成功:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('添加失败:', error.response?.data || error.message);
  }
}

async function example6_checkIPGray() {
  console.log('\n=== 示例6: 检查 IP 灰度状态 ===');
  try {
    const testIP = '192.168.1.100';
    const response = await axios.get(`${BASE_URL}/gray/check/${testIP}`, { headers });
    console.log('灰度检查结果:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('检查失败:', error.response?.data || error.message);
  }
}

async function example7_rotateKey(keyId) {
  console.log('\n=== 示例7: 轮换密钥 ===');
  try {
    const response = await axios.post(`${BASE_URL}/keys/${keyId}/rotate`, {}, { headers });
    console.log('轮换成功:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('轮换失败:', error.response?.data || error.message);
  }
}

async function example8_revokeKey(keyId) {
  console.log('\n=== 示例8: 吊销密钥 ===');
  try {
    const response = await axios.post(`${BASE_URL}/keys/${keyId}/revoke`, {
      reason: '不再使用'
    }, { headers });
    console.log('吊销成功:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('吊销失败:', error.response?.data || error.message);
  }
}

async function example9_getClusterStatus() {
  console.log('\n=== 示例9: 获取集群状态 ===');
  try {
    const response = await axios.get(`${BASE_URL}/cluster/status`, { headers });
    console.log('集群状态:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('获取失败:', error.response?.data || error.message);
  }
}

async function example10_getExpiryStats() {
  console.log('\n=== 示例10: 获取密钥过期统计 ===');
  try {
    const response = await axios.get(`${BASE_URL}/expiry/stats`, { headers });
    console.log('过期统计:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('获取失败:', error.response?.data || error.message);
  }
}

async function example11_bulkCreate() {
  console.log('\n=== 示例11: 批量创建密钥 ===');
  try {
    const response = await axios.post(`${BASE_URL}/keys/batch`, {
      count: 5,
      prefix: 'batch-test',
      level: 1,
      expireDays: 15
    }, { headers });
    console.log('批量创建成功，数量:', response.data.data.count);
    return response.data.data.keys.map(k => k.id);
  } catch (error) {
    console.error('批量创建失败:', error.response?.data || error.message);
    return [];
  }
}

async function example14_bulkDelete(keyIds) {
  console.log('\n=== 示例14: 批量删除密钥 ===');
  try {
    const response = await axios.delete(`${BASE_URL}/keys/batch`, {
      headers,
      data: { keyIds }
    });
    console.log('批量删除结果:', JSON.stringify(response.data.data, null, 2));
  } catch (error) {
    console.error('批量删除失败:', error.response?.data || error.message);
  }
}

async function example15_rateLimitStats() {
  console.log('\n=== 示例15: 获取限流风控统计 ===');
  try {
    const response = await axios.get(`${BASE_URL}/rate/stats`, { headers });
    console.log('限流统计:', JSON.stringify(response.data.data, null, 2));
  } catch (error) {
    console.error('获取失败:', error.response?.data || error.message);
  }
}

async function example16_blockIP() {
  console.log('\n=== 示例16: 封禁 IP ===');
  try {
    const response = await axios.post(`${BASE_URL}/rate/block/ip`, {
      ip: '10.0.0.100',
      duration: 3600,
      reason: '恶意请求'
    }, { headers });
    console.log('封禁结果:', JSON.stringify(response.data.data, null, 2));
  } catch (error) {
    console.error('封禁失败:', error.response?.data || error.message);
  }
}

async function example17_encryptionDemo() {
  console.log('\n=== 示例17: 加密解密测试 ===');
  try {
    const encryptResponse = await axios.post(`${BASE_URL}/encryption/encrypt`, {
      text: 'Hello, World!',
      level: 2
    }, { headers });
    console.log('加密结果:', JSON.stringify(encryptResponse.data.data, null, 2));

    const encryptedText = encryptResponse.data.data.encrypted;
    const decryptResponse = await axios.post(`${BASE_URL}/encryption/decrypt`, {
      text: encryptedText
    }, { headers });
    console.log('解密结果:', JSON.stringify(decryptResponse.data.data, null, 2));
  } catch (error) {
    console.error('加解密失败:', error.response?.data || error.message);
  }
}

async function example18_hotReloadStatus() {
  console.log('\n=== 示例18: 热重启状态 ===');
  try {
    const response = await axios.get(`${BASE_URL}/hotreload/status`, { headers });
    console.log('热重启状态:', JSON.stringify(response.data.data, null, 2));
  } catch (error) {
    console.error('获取失败:', error.response?.data || error.message);
  }
}

async function example19_fullHealthCheck() {
  console.log('\n=== 示例19: 完整健康检查 ===');
  try {
    const response = await axios.get(`${BASE_URL}/health/full`, { headers });
    console.log('健康检查:', JSON.stringify(response.data.data, null, 2));
  } catch (error) {
    console.error('检查失败:', error.response?.data || error.message);
  }
}

async function runAllExamples() {
  console.log('='.repeat(60));
  console.log('分布式 API 密钥管理集群 - 使用示例');
  console.log('='.repeat(60));

  await example9_getClusterStatus();
  await example19_fullHealthCheck();
  await example10_getExpiryStats();
  await example15_rateLimitStats();
  await example2_listKeys();
  await example5_addGrayRule();
  await example6_checkIPGray();
  const createdKeyIds = await example11_bulkCreate();
  if (createdKeyIds.length > 0) {
    await example14_bulkDelete(createdKeyIds);
  }
  await example17_encryptionDemo();
  await example18_hotReloadStatus();
  await example13_getAuthStats();

  console.log('\n' + '='.repeat(60));
  console.log('示例执行完成');
  console.log('='.repeat(60));
}

if (require.main === module) {
  runAllExamples().catch(console.error);
}

module.exports = {
  example1_createKey,
  example2_listKeys,
  example3_verifyAuth,
  example4_checkLevelAuth,
  example5_addGrayRule,
  example6_checkIPGray,
  example7_rotateKey,
  example8_revokeKey,
  example9_getClusterStatus,
  example10_getExpiryStats,
  example11_bulkCreate,
  example12_getKeyLogs,
  example13_getAuthStats,
  example14_bulkDelete,
  example15_rateLimitStats,
  example16_blockIP,
  example17_encryptionDemo,
  example18_hotReloadStatus,
  example19_fullHealthCheck,
  runAllExamples
};
