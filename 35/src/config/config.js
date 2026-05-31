require('dotenv').config();

module.exports = {
  opcua: {
    server: {
      host: process.env.OPCUA_SERVER_HOST || 'localhost',
      port: parseInt(process.env.OPCUA_SERVER_PORT || '4840'),
      endpoint: process.env.OPCUA_SERVER_ENDPOINT || 'opc.tcp://localhost:4840/UA/PlcSimulator'
    },
    client: {
      name: process.env.OPCUA_CLIENT_NAME || 'IoTGatewayClient',
      securityPolicy: process.env.OPCUA_SECURITY_POLICY || 'None',
      messageSecurityMode: process.env.OPCUA_MESSAGE_SECURITY_MODE || 'None'
    }
  },
  influxdb: {
    host: process.env.INFLUXDB_HOST || 'localhost',
    port: parseInt(process.env.INFLUXDB_PORT || '8086'),
    database: process.env.INFLUXDB_DATABASE || 'iot_data',
    username: process.env.INFLUXDB_USERNAME || 'admin',
    password: process.env.INFLUXDB_PASSWORD || 'admin'
  },
  api: {
    port: parseInt(process.env.API_PORT || '3000')
  },
  websocket: {
    port: parseInt(process.env.WS_PORT || '8080')
  },
  alert: {
    checkInterval: parseInt(process.env.ALERT_CHECK_INTERVAL || '1000')
  },
  plcDevices: [
    {
      id: 'PLC001',
      name: '生产线A-PLC',
      tags: {
        temperature: { nodeId: 'ns=1;s=PLC001.Temperature', name: '温度', unit: '°C', dataType: 'Double' },
        pressure: { nodeId: 'ns=1;s=PLC001.Pressure', name: '压力', unit: 'MPa', dataType: 'Double' },
        speed: { nodeId: 'ns=1;s=PLC001.Speed', name: '转速', unit: 'RPM', dataType: 'Int32' }
      }
    },
    {
      id: 'PLC002',
      name: '生产线B-PLC',
      tags: {
        temperature: { nodeId: 'ns=1;s=PLC002.Temperature', name: '温度', unit: '°C', dataType: 'Double' },
        pressure: { nodeId: 'ns=1;s=PLC002.Pressure', name: '压力', unit: 'MPa', dataType: 'Double' },
        speed: { nodeId: 'ns=1;s=PLC002.Speed', name: '转速', unit: 'RPM', dataType: 'Int32' }
      }
    },
    {
      id: 'PLC003',
      name: '生产线C-PLC',
      tags: {
        temperature: { nodeId: 'ns=1;s=PLC003.Temperature', name: '温度', unit: '°C', dataType: 'Double' },
        pressure: { nodeId: 'ns=1;s=PLC003.Pressure', name: '压力', unit: 'MPa', dataType: 'Double' },
        speed: { nodeId: 'ns=1;s=PLC003.Speed', name: '转速', unit: 'RPM', dataType: 'Int32' }
      }
    }
  ],
  alertRules: [
    { id: 'RULE001', plcId: 'PLC001', tag: 'temperature', type: 'threshold', operator: '>', value: 80, severity: 'high', description: 'PLC001温度过高' },
    { id: 'RULE002', plcId: 'PLC001', tag: 'pressure', type: 'threshold', operator: '>', value: 1.2, severity: 'medium', description: 'PLC001压力过高' },
    { id: 'RULE003', plcId: 'PLC002', tag: 'temperature', type: 'threshold', operator: '>', value: 75, severity: 'high', description: 'PLC002温度过高' },
    { id: 'RULE004', plcId: 'PLC002', tag: 'speed', type: 'changeRate', operator: '>', value: 500, windowMs: 5000, severity: 'medium', description: 'PLC002转速突变' },
    { id: 'RULE005', plcId: 'PLC003', tag: 'pressure', type: 'threshold', operator: '<', value: 0.3, severity: 'low', description: 'PLC003压力过低' },
    { id: 'RULE006', plcId: 'PLC003', tag: 'temperature', type: 'changeRate', operator: '>', value: 10, windowMs: 3000, severity: 'high', description: 'PLC003温度快速上升' }
  ]
};
