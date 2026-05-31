
const { parentPort, workerData } = require('worker_threads');
const jsLZ4 = require('../../lib/js-lz4.js');

const { workerId } = workerData;

parentPort.on('message', (msg) => {
  const { type, payload } = msg;
  
  switch (type) {
    case 'compress':
      try {
        const compressed = jsLZ4.compress(payload.blockData);
        
        const header = Buffer.alloc(12);
        header.writeUInt32LE(0x4B434C42, 0);
        header.writeUInt32LE(payload.blockData.length, 4);
        header.writeUInt32LE(compressed.length, 8);
        
        const result = Buffer.concat([header, compressed]);
        
        parentPort.postMessage({
          type: 'result',
          payload: {
            taskId: payload.taskId,
            index: payload.blockIndex,
            data: result,
            uncompressedSize: payload.blockData.length,
            compressedSize: result.length
          }
        });
      } catch (error) {
        parentPort.postMessage({
          type: 'error',
          payload: {
            taskId: payload.taskId,
            blockIndex: payload.blockIndex,
            message: error.message
          }
        });
      }
      break;
      
    case 'ping':
      parentPort.postMessage({ type: 'pong', payload: { workerId } });
      break;
      
    default:
      console.warn(`Worker ${workerId}: Unknown message type`, type);
  }
});

parentPort.postMessage({ type: 'ready', payload: { workerId } });
