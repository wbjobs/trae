import {
  Board, BoardCell, CellType, Piece, PieceType, Player, Position,
  BOARD_ROWS, BOARD_COLS, WATER_CELLS, TRAP_CELLS_PLAYER1, TRAP_CELLS_PLAYER2,
  DEN_PLAYER1, DEN_PLAYER2, INITIAL_PIECES, PIECE_RANK
} from './types';
import { v4 as uuidv4 } from 'uuid';

export class BoardHelper {
  static createBoard(): Board {
    const board: Board = [];
    for (let row = 0; row < BOARD_ROWS; row++) {
      board[row] = [];
      for (let col = 0; col < BOARD_COLS; col++) {
        board[row][col] = {
          type: CellType.NORMAL,
          piece: null
        };
      }
    }

    WATER_CELLS.forEach(pos => {
      board[pos.row][pos.col].type = CellType.WATER;
    });

    TRAP_CELLS_PLAYER1.forEach(pos => {
      board[pos.row][pos.col].type = CellType.TRAP_PLAYER1;
    });

    TRAP_CELLS_PLAYER2.forEach(pos => {
      board[pos.row][pos.col].type = CellType.TRAP_PLAYER2;
    });

    board[DEN_PLAYER1.row][DEN_PLAYER1.col].type = CellType.DEN_PLAYER1;
    board[DEN_PLAYER2.row][DEN_PLAYER2.col].type = CellType.DEN_PLAYER2;

    return board;
  }

  static initPieces(board: Board): Piece[] {
    const pieces: Piece[] = [];

    INITIAL_PIECES.forEach(init => {
      const piece: Piece = {
        id: uuidv4(),
        type: init.type,
        owner: init.owner,
        position: { ...init.position },
        inWater: false
      };
      board[init.position.row][init.position.col].piece = piece;
      pieces.push(piece);
    });

    return pieces;
  }

  static getCell(board: Board, pos: Position): BoardCell | null {
    if (pos.row < 0 || pos.row >= BOARD_ROWS || pos.col < 0 || pos.col >= BOARD_COLS) {
      return null;
    }
    return board[pos.row][pos.col];
  }

  static isWater(pos: Position): boolean {
    return WATER_CELLS.some(w => w.row === pos.row && w.col === pos.col);
  }

  static isTrap(pos: Position, player: Player): boolean {
    if (player === Player.PLAYER1) {
      return TRAP_CELLS_PLAYER2.some(t => t.row === pos.row && t.col === pos.col);
    } else {
      return TRAP_CELLS_PLAYER1.some(t => t.row === pos.row && t.col === pos.col);
    }
  }

  static isOwnTrap(pos: Position, player: Player): boolean {
    if (player === Player.PLAYER1) {
      return TRAP_CELLS_PLAYER1.some(t => t.row === pos.row && t.col === pos.col);
    } else {
      return TRAP_CELLS_PLAYER2.some(t => t.row === pos.row && t.col === pos.col);
    }
  }

  static isDen(pos: Position, player: Player): boolean {
    if (player === Player.PLAYER1) {
      return pos.row === DEN_PLAYER2.row && pos.col === DEN_PLAYER2.col;
    } else {
      return pos.row === DEN_PLAYER1.row && pos.col === DEN_PLAYER1.col;
    }
  }

  static isOwnDen(pos: Position, player: Player): boolean {
    if (player === Player.PLAYER1) {
      return pos.row === DEN_PLAYER1.row && pos.col === DEN_PLAYER1.col;
    } else {
      return pos.row === DEN_PLAYER2.row && pos.col === DEN_PLAYER2.col;
    }
  }

  static getAdjacentPositions(pos: Position): Position[] {
    const positions: Position[] = [];
    const directions = [
      { row: -1, col: 0 },
      { row: 1, col: 0 },
      { row: 0, col: -1 },
      { row: 0, col: 1 }
    ];

    for (const dir of directions) {
      const newPos = { row: pos.row + dir.row, col: pos.col + dir.col };
      if (newPos.row >= 0 && newPos.row < BOARD_ROWS &&
          newPos.col >= 0 && newPos.col < BOARD_COLS) {
        positions.push(newPos);
      }
    }

    return positions;
  }

  static cloneBoard(board: Board): Board {
    return board.map(row =>
      row.map(cell => ({
        type: cell.type,
        piece: cell.piece ? { ...cell.piece, position: { ...cell.piece.position } } : null
      }))
    );
  }

  static canCapture(attacker: Piece, defender: Piece, board: Board): boolean {
    if (attacker.owner === defender.owner) return false;

    if (defender.inWater && !attacker.inWater) return false;
    if (attacker.inWater && !defender.inWater) return false;

    const defenderPos = defender.position;
    const isDefenderInTrap = BoardHelper.isTrap(defenderPos, defender.owner);

    if (isDefenderInTrap) return true;

    if (attacker.type === PieceType.RAT && defender.type === PieceType.ELEPHANT) {
      return true;
    }

    if (attacker.type === PieceType.ELEPHANT && defender.type === PieceType.RAT) {
      return false;
    }

    return PIECE_RANK[attacker.type] >= PIECE_RANK[defender.type];
  }
}
