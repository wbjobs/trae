
importScripts('../../dist/lz4-browser.js');

const state = {
  ready: false,
  currentTask: null
};

function init() {
  self.postMessage({ type: 'ready' });
  state.ready = true;
}

function compressBlock(blockData, blockIndex) {
  try {
    const compressed = self.LZ4.compress(blockData);
    
    const result = new Uint8Array(12 + compressed.length);
    const view = new DataView(result.buffer);
    
    view.setUint32(0, 0x4B434C42, true);
    view.setUint32(4, blockData.length, true);
    view.setUint32(8, compressed.length, true);
    
    result.set(compressed, 12);
    
    return {
      index: blockIndex,
      data: result,
      uncompressedSize: blockData.length,
      compressedSize: result.length
    };
  } catch (error) {
    throw new Error(`Compression failed for block ${blockIndex}: ${error.message}`);
  }
}

self.onmessage = function(e) {
  const { type, payload } = e.data;
  
  switch (type) {
    case 'init':
      init();
      break;
      
    case 'compress':
        const { blockData, blockIndex } = payload;
        try {
          const result = compressBlock(blockData, blockIndex);
          self.postMessage({
            type: 'result',
            payload: result
          }, [result.data.buffer]);
        } catch (error) {
          self.postMessage({
            type: 'error',
            payload: { error: error.message, blockIndex }
          });
        }
        break;
        
    case 'compressSAB':
        const { sab, offset, length, blockIndex: idx } = payload;
        try {
          const blockData = new Uint8Array(sab, offset, length);
          const result = compressBlock(blockData.slice(), idx);
          self.postMessage({
            type: 'result',
            payload: result
          }, [result.data.buffer]);
        } catch (error) {
          self.postMessage({
            type: 'error',
            payload: { error: error.message, blockIndex: idx }
          });
        }
        break;
        
    case 'ping':
      self.postMessage({ type: 'pong' });
      break;
      
    default:
      console.warn('Unknown message type:', type);
  }
};

init();
