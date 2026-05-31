import { messageParser, MessageParser } from '../parse-layer/message-parser/src';
import { MessageRouter } from '../forward-layer/message-router/src';
import { TSDBStorage } from '../parse-layer/tsdb-storage/src';
import { DeviceManager } from '../forward-layer/device-manager/src';
import type { ParsedMessage, RouteRule, Schema } from '../common/types/index';
import { generateId } from '../common/utils/index';

async function runTests() {
  console.log('========================================');
  console.log('  异构终端协议中台 - 集成测试');
  console.log('========================================\n');

  let passed = 0;
  let failed = 0;

  const testSchema: Schema = {
    id: generateId(),
    name: '测试温度报文',
    protocolId: 'test-protocol',
    description: '测试温度传感器报文结构',
    fields: [
      { name: 'deviceId', type: 'string', required: true, description: '设备ID' },
      { name: 'temperature', type: 'number', required: true, description: '温度值' },
      { name: 'humidity', type: 'number', required: false, description: '湿度值' },
      { name: 'timestamp', type: 'number', required: true, description: '时间戳' }
    ],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const parser = new MessageParser();
  parser.registerSchema(testSchema);

  console.log('📋 测试1: 报文解析模块');
  try {
    const rawData = JSON.stringify({
      deviceId: 'sensor-001',
      temperature: 25.5,
      humidity: 60,
      timestamp: Date.now()
    });

    const result = parser.parse(rawData, 'MQTT', testSchema.id, 'sensor-001');
    
    if (result.success && result.parsedData.temperature === 25.5) {
      console.log('  ✅ 报文解析成功');
      console.log(`     设备ID: ${result.parsedData.deviceId}`);
      console.log(`     温度: ${result.parsedData.temperature}°C`);
      console.log(`     湿度: ${result.parsedData.humidity}%`);
      passed++;
    } else {
      console.log('  ❌ 报文解析失败');
      failed++;
    }
  } catch (e) {
    console.log('  ❌ 报文解析异常:', e);
    failed++;
  }

  console.log('\n📋 测试2: 自动解析检测');
  try {
    const jsonData = '{"key": "value", "number": 123}';
    const result1 = parser.parse(jsonData, 'HTTP');
    
    if (result1.success && result1.parsedData.key === 'value') {
      console.log('  ✅ JSON自动解析成功');
      passed++;
    } else {
      console.log('  ❌ JSON自动解析失败');
      failed++;
    }

    const hexData = '48656C6C6F20576F726C64';
    const result2 = parser.parse(hexData, 'TCP');
    
    if (result2.success && result2.parsedData.hex === hexData) {
      console.log('  ✅ 十六进制自动解析成功');
      passed++;
    } else {
      console.log('  ❌ 十六进制自动解析失败');
      failed++;
    }
  } catch (e) {
    console.log('  ❌ 自动解析异常:', e);
    failed++;
  }

  console.log('\n📋 测试3: 消息路由模块');
  try {
    const router = new MessageRouter();
    
    const rule: RouteRule = {
      id: generateId(),
      name: '高温告警路由',
      description: '当温度超过30度时转发告警',
      enabled: true,
      conditions: [
        { type: 'content', field: 'temperature', operator: 'gt', value: '30' }
      ],
      targets: [
        { type: 'webhook', value: 'http://alert.example.com/high-temp' }
      ],
      priority: 1,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    router.loadRules([rule]);

    const highTempMsg: ParsedMessage = {
      id: generateId(),
      rawData: '',
      protocol: 'MQTT',
      deviceId: 'sensor-001',
      timestamp: Date.now(),
      parsedData: { temperature: 35.5, deviceId: 'sensor-001' },
      success: true
    };

    const logs = await router.route(highTempMsg);
    
    if (logs.length > 0 && logs[0].ruleId === rule.id) {
      console.log('  ✅ 路由规则匹配成功');
      console.log(`     匹配规则: ${rule.name}`);
      console.log(`     转发目标: ${logs[0].targetType} - ${logs[0].targetValue}`);
      console.log(`     转发状态: ${logs[0].success ? '成功' : '失败（目标不可达）'}`);
      passed++;
    } else {
      console.log('  ❌ 路由规则匹配失败');
      failed++;
    }

    const lowTempMsg: ParsedMessage = {
      ...highTempMsg,
      parsedData: { temperature: 25.5, deviceId: 'sensor-001' }
    };

    const logs2 = await router.route(lowTempMsg);
    
    if (logs2.length === 0) {
      console.log('  ✅ 不匹配规则正确过滤');
      passed++;
    } else {
      console.log('  ❌ 不应该匹配的规则被匹配');
      failed++;
    }
  } catch (e) {
    console.log('  ❌ 消息路由异常:', e);
    failed++;
  }

  console.log('\n📋 测试4: 时序数据库存储');
  try {
    const storage = new TSDBStorage();
    
    const testMessages: ParsedMessage[] = [];
    for (let i = 0; i < 10; i++) {
      testMessages.push({
        id: generateId(),
        rawData: `test data ${i}`,
        protocol: i % 2 === 0 ? 'MQTT' : 'HTTP',
        deviceId: `device-${i % 3}`,
        timestamp: Date.now() - i * 1000,
        parsedData: { value: i * 10 },
        success: i % 5 !== 0
      });
    }

    for (const msg of testMessages) {
      await storage.storeRawMessage(msg);
      if (msg.success) {
        await storage.storeParsedLog(msg);
      }
    }

    const rawResult = await storage.queryRawMessages({ limit: 5 });
    const parsedResult = await storage.queryParsedLogs({ success: true });
    const deviceResult = await storage.queryRawMessages({ deviceId: 'device-0' });

    if (rawResult.total === 10 && rawResult.list.length === 5) {
      console.log('  ✅ 原始报文存储与分页查询成功');
      passed++;
    } else {
      console.log('  ❌ 原始报文存储查询失败');
      failed++;
    }

    if (parsedResult.total === 8) {
      console.log('  ✅ 解析日志筛选查询成功');
      console.log(`     成功解析: ${parsedResult.total} 条`);
      passed++;
    } else {
      console.log('  ❌ 解析日志筛选查询失败');
      failed++;
    }

    if (deviceResult.total === 4) {
      console.log('  ✅ 按设备筛选查询成功');
      console.log(`     device-0 报文数: ${deviceResult.total}`);
      passed++;
    } else {
      console.log('  ❌ 按设备筛选查询失败');
      failed++;
    }
  } catch (e) {
    console.log('  ❌ 时序存储异常:', e);
    failed++;
  }

  console.log('\n📋 测试5: 设备管理模块');
  try {
    const deviceMgr = new DeviceManager();
    
    const device1 = deviceMgr.registerDevice({
      name: '温度传感器A',
      type: 'sensor',
      protocol: 'MQTT',
      status: 'online',
      metadata: { location: '车间A' }
    });

    const device2 = deviceMgr.registerDevice({
      name: 'PLC控制器B',
      type: 'controller',
      protocol: 'Modbus',
      status: 'online',
      metadata: { location: '车间B' }
    });

    deviceMgr.addToGroup('production-line-1', device1.id);
    deviceMgr.addToGroup('production-line-1', device2.id);

    const devices = deviceMgr.listDevices();
    const groupDevices = deviceMgr.getGroupDevices('production-line-1');
    const stats = deviceMgr.getStatistics();

    if (devices.length === 2) {
      console.log('  ✅ 设备注册与列表查询成功');
      passed++;
    } else {
      console.log('  ❌ 设备注册失败');
      failed++;
    }

    if (groupDevices.length === 2) {
      console.log('  ✅ 设备分组管理成功');
      console.log(`     生产线1设备数: ${groupDevices.length}`);
      passed++;
    } else {
      console.log('  ❌ 设备分组管理失败');
      failed++;
    }

    if (stats.total === 2 && stats.online === 2 && stats.byProtocol.MQTT === 1) {
      console.log('  ✅ 设备统计信息正确');
      console.log(`     总设备: ${stats.total}, 在线: ${stats.online}`);
      console.log(`     协议分布: MQTT=${stats.byProtocol.MQTT}, Modbus=${stats.byProtocol.Modbus}`);
      passed++;
    } else {
      console.log('  ❌ 设备统计信息错误');
      failed++;
    }

    deviceMgr.destroy();
  } catch (e) {
    console.log('  ❌ 设备管理异常:', e);
    failed++;
  }

  console.log('\n📋 测试6: Schema验证');
  try {
    const schema: Schema = {
      id: generateId(),
      name: '验证测试Schema',
      protocolId: 'test',
      description: '',
      fields: [
        { name: 'requiredField', type: 'string', required: true },
        { name: 'optionalField', type: 'number', required: false },
        { 
          name: 'nested', 
          type: 'object', 
          required: true,
          children: [
            { name: 'innerField', type: 'boolean', required: true }
          ]
        }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    parser.registerSchema(schema);

    const validData = JSON.stringify({
      requiredField: 'test',
      optionalField: 123,
      nested: { innerField: true }
    });

    const result1 = parser.parse(validData, 'TEST', schema.id);
    if (result1.success) {
      console.log('  ✅ 合法数据验证通过');
      passed++;
    } else {
      console.log('  ❌ 合法数据验证失败');
      failed++;
    }

    const invalidData = JSON.stringify({
      optionalField: 123,
      nested: { innerField: 'not boolean' }
    });

    const result2 = parser.parse(invalidData, 'TEST', schema.id);
    if (!result2.success) {
      console.log('  ✅ 非法数据验证失败（预期行为）');
      console.log(`     错误信息: ${result2.error}`);
      passed++;
    } else {
      console.log('  ❌ 非法数据应该验证失败');
      failed++;
    }
  } catch (e) {
    console.log('  ❌ Schema验证异常:', e);
    failed++;
  }

  console.log('\n========================================');
  console.log('  测试结果汇总');
  console.log('========================================');
  console.log(`  ✅ 通过: ${passed}`);
  console.log(`  ❌ 失败: ${failed}`);
  console.log(`  📊 通过率: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log('========================================\n');

  return failed === 0;
}

if (require.main === module) {
  runTests().then(success => {
    process.exit(success ? 0 : 1);
  });
}

export { runTests };
