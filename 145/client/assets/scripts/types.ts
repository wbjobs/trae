export enum PieceType {
  RAT = 0,
  CAT = 1,
  DOG = 2,
  WOLF = 3,
  LEOPARD = 4,
  TIGER = 5,
  LION = 6,
  ELEPHANT = 7
}

export const PIECE_NAMES: Record<PieceType, string> = {
  [PieceType.RAT]: '鼠',
  [PieceType.CAT]: '猫',
  [PieceType.DOG]: '狗',
  [PieceType.WOLF]: '狼',
  [PieceType.LEOPARD]: '豹',
  [PieceType.TIGER]: '虎',
  [PieceType.LION]: '狮',
  [PieceType.ELEPHANT]: '象'
};

export const PIECE_RANK: Record<PieceType, number> = {
  [PieceType.RAT]: 1,
  [PieceType.CAT]: 2,
  [PieceType.DOG]: 3,
  [PieceType.WOLF]: 4,
  [PieceType.LEOPARD]: 5,
  [PieceType.TIGER]: 6,
  [PieceType.LION]: 7,
  [PieceType.ELEPHANT]: 8
};

export enum Player {
  NONE = 0,
  PLAYER1 = 1,
  PLAYER2 = 2
}

export enum CellType {
  NORMAL = 0,
  WATER = 1,
  TRAP_PLAYER1 = 2,
  TRAP_PLAYER2 = 3,
  DEN_PLAYER1 = 4,
  DEN_PLAYER2 = 5
}

export interface Position {
  row: number;
  col: number;
}

export interface Piece {
  id: string;
  type: PieceType;
  owner: Player;
  position: Position;
  inWater: boolean;
}

export interface BoardCell {
  type: CellType;
  piece: Piece | null;
}

export type Board = BoardCell[][];

export interface GameState {
  board: Board;
  currentPlayer: Player;
  isGameOver: boolean;
  winner: Player;
  turnCount: number;
  moveHistory: MoveRecord[];
}

export interface MoveRecord {
  pieceId: string;
  pieceType: PieceType;
  owner: Player;
  from: Position;
  to: Position;
  capturedPiece: Piece | null;
  isJump: boolean;
  turnNumber: number;
}

export type WSMessageType =
  | 'connected'
  | 'match_request'
  | 'match_cancel'
  | 'match_success'
  | 'match_failed'
  | 'game_start'
  | 'game_state'
  | 'move'
  | 'move_result'
  | 'chat'
  | 'spectate_enter'
  | 'spectate_leave'
  | 'spectate_list'
  | 'reconnect_request'
  | 'reconnect_success'
  | 'reconnect_failed'
  | 'heartbeat'
  | 'player_disconnected'
  | 'player_reconnected'
  | 'spectator_joined'
  | 'spectator_left'
  | 'ping'
  | 'error'
  | 'game_over'
  | 'ai_match_request'
  | 'ai_match_success'
  | 'ai_move'
  | 'ai_leave';

export interface WSMessage<T = any> {
  type: WSMessageType;
  data: T;
  timestamp: number;
}

export interface MoveRequest {
  roomId: string;
  playerId: string;
  from: Position;
  to: Position;
}

export interface MoveResponse {
  success: boolean;
  gameState: GameState | null;
  error?: string;
}

export interface ReconnectRequest {
  roomId: string;
  playerId: string;
}

export interface ReconnectResponse {
  success: boolean;
  gameState: GameState | null;
  playerNumber: Player;
  error?: string;
}

export const BOARD_ROWS = 9;
export const BOARD_COLS = 8;

export const WATER_CELLS: Position[] = [
  { row: 3, col: 1 }, { row: 3, col: 2 },
  { row: 4, col: 1 }, { row: 4, col: 2 },
  { row: 5, col: 1 }, { row: 5, col: 2 },
  { row: 3, col: 5 }, { row: 3, col: 6 },
  { row: 4, col: 5 }, { row: 4, col: 6 },
  { row: 5, col: 5 }, { row: 5, col: 6 }
];

export const TRAP_CELLS_PLAYER1: Position[] = [
  { row: 0, col: 2 }, { row: 0, col: 4 }, { row: 1, col: 3 }
];

export const TRAP_CELLS_PLAYER2: Position[] = [
  { row: 8, col: 2 }, { row: 8, col: 4 }, { row: 7, col: 3 }
];

export const DEN_PLAYER1: Position = { row: 0, col: 3 };
export const DEN_PLAYER2: Position = { row: 8, col: 3 };

export const PLAYER_COLORS: Record<Player, string> = {
  [Player.NONE]: '#FFFFFF',
  [Player.PLAYER1]: '#FF6B6B',
  [Player.PLAYER2]: '#4ECDC4'
};

export const PLAYER_NAMES: Record<Player, string> = {
  [Player.NONE]: '无',
  [Player.PLAYER1]: '红方',
  [Player.PLAYER2]: '蓝方'
};
