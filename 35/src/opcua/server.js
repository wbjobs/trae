const opcua = require('node-opcua');
const config = require('../config/config');

const { OPCUAServer, Variant, DataType, StatusCodes, nodesets } = opcua;

const serverOptions = {
  port: config.opcua.server.port,
  buildInfo: {
    productName: 'PLC Simulator Server',
    buildNumber: '1.0.0',
    buildDate: new Date()
  },
  nodeset_filename: [nodesets.standard]
};

const plcData = {};
config.plcDevices.forEach(plc => {
  plcData[plc.id] = {
    temperature: 25 + Math.random() * 10,
    pressure: 0.5 + Math.random() * 0.5,
    speed: 1000 + Math.random() * 500
  };
});

function updatePlcData() {
  config.plcDevices.forEach(plc => {
    const data = plcData[plc.id];
    
    data.temperature += (Math.random() - 0.5) * 2;
    data.temperature = Math.max(15, Math.min(95, data.temperature));
    
    data.pressure += (Math.random() - 0.5) * 0.1;
    data.pressure = Math.max(0.1, Math.min(1.5, data.pressure));
    
    data.speed += (Math.random() - 0.5) * 100;
    data.speed = Math.max(500, Math.min(2500, data.speed));
    
    if (Math.random() < 0.02) {
      data.temperature = 90 + Math.random() * 10;
    }
  });
}

async function startServer() {
  try {
    const server = new OPCUAServer(serverOptions);
    
    console.log('[OPC UA Server] Initializing...');
    await server.initialize();
    
    const addressSpace = server.engine.addressSpace;
    const namespace = addressSpace.getOwnNamespace();
    
    const devicesFolder = namespace.addFolder('ObjectsFolder', {
      browseName: 'Devices'
    });
    
    config.plcDevices.forEach(plc => {
      const plcFolder = namespace.addFolder(devicesFolder, {
        browseName: plc.id,
        displayName: { text: plc.name }
      });
      
      namespace.addVariable({
        componentOf: plcFolder,
        browseName: 'Temperature',
        nodeId: `ns=1;s=${plc.id}.Temperature`,
        displayName: { text: `${plc.name} 温度` },
        description: { text: '设备温度' },
        dataType: DataType.Double,
        valueRank: -1,
        minimumSamplingInterval: 100,
        value: new Variant({
          dataType: DataType.Double,
          value: plcData[plc.id].temperature
        }),
        userAccessLevel: 'CurrentRead',
        accessLevel: 'CurrentRead'
      });
      
      namespace.addVariable({
        componentOf: plcFolder,
        browseName: 'Pressure',
        nodeId: `ns=1;s=${plc.id}.Pressure`,
        displayName: { text: `${plc.name} 压力` },
        description: { text: '设备压力' },
        dataType: DataType.Double,
        valueRank: -1,
        minimumSamplingInterval: 100,
        value: new Variant({
          dataType: DataType.Double,
          value: plcData[plc.id].pressure
        }),
        userAccessLevel: 'CurrentRead',
        accessLevel: 'CurrentRead'
      });
      
      namespace.addVariable({
        componentOf: plcFolder,
        browseName: 'Speed',
        nodeId: `ns=1;s=${plc.id}.Speed`,
        displayName: { text: `${plc.name} 转速` },
        description: { text: '设备转速' },
        dataType: DataType.Int32,
        valueRank: -1,
        minimumSamplingInterval: 100,
        value: new Variant({
          dataType: DataType.Int32,
          value: Math.round(plcData[plc.id].speed)
        }),
        userAccessLevel: 'CurrentRead',
        accessLevel: 'CurrentRead'
      });
    });
    
    server.engine.addressSpace.rootFolder.objects.server.serverStatus.currentTime.setValueFromSource({
      dataType: DataType.DateTime,
      value: new Date()
    });
    
    setInterval(() => {
      updatePlcData();
      
      config.plcDevices.forEach(plc => {
        const tempNode = addressSpace.findNode(`ns=1;s=${plc.id}.Temperature`);
        const pressureNode = addressSpace.findNode(`ns=1;s=${plc.id}.Pressure`);
        const speedNode = addressSpace.findNode(`ns=1;s=${plc.id}.Speed`);
        
        if (tempNode) {
          tempNode.setValueFromSource(new Variant({
            dataType: DataType.Double,
            value: plcData[plc.id].temperature
          }));
        }
        if (pressureNode) {
          pressureNode.setValueFromSource(new Variant({
            dataType: DataType.Double,
            value: plcData[plc.id].pressure
          }));
        }
        if (speedNode) {
          speedNode.setValueFromSource(new Variant({
            dataType: DataType.Int32,
            value: Math.round(plcData[plc.id].speed)
          }));
        }
      });
      
      server.engine.addressSpace.rootFolder.objects.server.serverStatus.currentTime.setValueFromSource({
        dataType: DataType.DateTime,
        value: new Date()
      });
    }, 500);
    
    await server.start();
    
    console.log(`[OPC UA Server] Server is now listening on port ${config.opcua.server.port}`);
    console.log(`[OPC UA Server] Endpoint URL: ${config.opcua.server.endpoint}`);
    console.log('[OPC UA Server] Simulated PLC devices:');
    config.plcDevices.forEach(plc => {
      console.log(`  - ${plc.id}: ${plc.name}`);
      console.log(`    Temperature: ns=1;s=${plc.id}.Temperature`);
      console.log(`    Pressure: ns=1;s=${plc.id}.Pressure`);
      console.log(`    Speed: ns=1;s=${plc.id}.Speed`);
    });
    
    process.on('SIGINT', async () => {
      console.log('[OPC UA Server] Shutting down...');
      await server.shutdown(1000);
      console.log('[OPC UA Server] Server shutdown complete');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('[OPC UA Server] Failed to start:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
