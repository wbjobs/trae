export const CONFIG = {
  SERVER_URL: 'ws://localhost:8080/ws',
  REDIS_URL: 'redis://localhost:6379',
  MATCH_TIMEOUT: 30000,
  RECONNECT_TIMEOUT: 10000,
  HEARTBEAT_INTERVAL: 30000,
  MAX_RECONNECT_ATTEMPTS: 5,
  CELL_SIZE: 70,
  BOARD_OFFSET_X: -280,
  BOARD_OFFSET_Y: -315
};

export const PIECE_RANK_NAMES: Record<number, string> = {
  1: '鼠',
  2: '猫',
  3: '狗',
  4: '狼',
  5: '豹',
  6: '虎',
  7: '狮',
  8: '象'
};

export const PIECE_DESCRIPTIONS: Record<string, string> = {
  RAT: '可以进入河中，可以吃象，被其它棋子吃',
  CAT: '普通棋子，不能进入河中',
  DOG: '普通棋子，不能进入河中',
  WOLF: '普通棋子，不能进入河中',
  LEOPARD: '普通棋子，不能进入河中',
  TIGER: '可以跳过河（河中有鼠时不能跳）',
  LION: '可以跳过河（河中有鼠时不能跳）',
  ELEPHANT: '最大的棋子，不能进入河中，怕鼠'
};
