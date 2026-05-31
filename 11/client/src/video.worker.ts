const ctx: Worker = self as any;

interface InitMessage {
  type: 'init';
}

interface VideoDataMessage {
  type: 'video-data';
  data: Uint8Array;
  pts: number;
  isKeyFrame: boolean;
}

interface ResetMessage {
  type: 'reset';
}

interface DecodedFrame {
  type: 'frame';
  frameId: number;
  pts: number;
  width: number;
  height: number;
}

interface FrameTransfer {
  type: 'frame-transfer';
  frame: VideoFrame;
  pts: number;
}

interface Stats {
  type: 'stats';
  framesDecoded: number;
  framesDropped: number;
  queueSize: number;
}

let decoder: VideoDecoder | null = null;
let framesDecoded = 0;
let framesDropped = 0;
let frameIdCounter = 0;
let initialized = false;

const frameQueue: VideoFrame[] = [];
const MAX_QUEUE_SIZE = 30;

const DECODER_CONFIG: VideoDecoderConfig = {
  codec: 'avc1.42001E',
  hardwareAcceleration: 'prefer-hardware'
};

function createDecoder(): VideoDecoder {
  if (!('VideoDecoder' in self)) {
    throw new Error('WebCodecs VideoDecoder is not supported in this browser');
  }

  const decoder = new VideoDecoder({
    output: (frame: VideoFrame) => {
      handleDecodedFrame(frame);
    },
    error: (error: Error) => {
      console.error('[VideoWorker] Decoder error:', error);
      ctx.postMessage({ type: 'error', message: error.message });
    }
  });

  return decoder;
}

function handleDecodedFrame(frame: VideoFrame): void {
  framesDecoded++;
  
  if (frameQueue.length >= MAX_QUEUE_SIZE) {
    const oldFrame = frameQueue.shift();
    if (oldFrame) {
      oldFrame.close();
      framesDropped++;
    }
  }

  frameQueue.push(frame);

  transferFrameToMain();
  
  if (framesDecoded % 30 === 0) {
    sendStats();
  }
}

function transferFrameToMain(): void {
  if (frameQueue.length === 0) return;

  const frame = frameQueue.shift();
  if (!frame) return;

  const message: FrameTransfer = {
    type: 'frame-transfer',
    frame,
    pts: frame.timestamp / 1000000
  };

  ctx.postMessage(message, [frame]);
}

async function initDecoder(): Promise<void> {
  if (initialized) return;

  decoder = createDecoder();
  
  const support = await VideoDecoder.isConfigSupported(DECODER_CONFIG);
  if (!support.supported) {
    throw new Error('H.264 video codec not supported');
  }

  decoder.configure(DECODER_CONFIG);
  initialized = true;
  
  console.log('[VideoWorker] Decoder initialized with H.264 codec');
}

function decodeChunk(data: Uint8Array, pts: number, isKeyFrame: boolean): void {
  if (!decoder || !initialized) {
    console.warn('[VideoWorker] Decoder not initialized');
    return;
  }

  if (decoder.state === 'closed') {
    console.warn('[VideoWorker] Decoder is closed, reinitializing...');
    initialized = false;
    initDecoder();
    return;
  }

  const chunk = new EncodedVideoChunk({
    type: isKeyFrame ? 'key' : 'delta',
    timestamp: Math.round(pts * 1000000),
    data
  });

  try {
    decoder.decode(chunk);
  } catch (error) {
    console.error('[VideoWorker] Failed to decode chunk:', error);
  }
}

function sendStats(): void {
  const stats: Stats = {
    type: 'stats',
    framesDecoded,
    framesDropped,
    queueSize: frameQueue.length
  };
  ctx.postMessage(stats);
}

function reset(): void {
  if (decoder) {
    try {
      decoder.flush();
    } catch (e) {
      // Ignore flush errors
    }
    decoder.close();
    decoder = null;
  }

  for (const frame of frameQueue) {
    frame.close();
  }
  frameQueue.length = 0;

  framesDecoded = 0;
  framesDropped = 0;
  frameIdCounter = 0;
  initialized = false;

  console.log('[VideoWorker] Reset complete');
}

ctx.addEventListener('message', (event: MessageEvent) => {
  const message = event.data;

  switch (message.type) {
    case 'init':
      initDecoder().catch((error) => {
        ctx.postMessage({ type: 'error', message: error.message });
      });
      break;

    case 'video-data':
      decodeChunk(message.data, message.pts, message.isKeyFrame);
      break;

    case 'request-frame':
      transferFrameToMain();
      break;

    case 'reset':
      reset();
      initDecoder().catch((error) => {
        ctx.postMessage({ type: 'error', message: error.message });
      });
      break;

    case 'get-stats':
      sendStats();
      break;

    default:
      console.warn('[VideoWorker] Unknown message type:', message.type);
  }
});

ctx.addEventListener('error', (event) => {
  console.error('[VideoWorker] Worker error:', event.message);
});

console.log('[VideoWorker] Video worker loaded');

export {};
