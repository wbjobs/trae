import {
  Board, Piece, PieceType, Player, Position, GameState, MoveRecord,
  BOARD_ROWS, BOARD_COLS, WATER_CELLS
} from '../types';
import { BoardHelper } from './Board';

export class GameRules {
  static getValidMoves(board: Board, piece: Piece): { positions: Position[]; isJump: boolean }[] {
    if (piece.type === PieceType.LION || piece.type === PieceType.TIGER) {
      return GameRules.getLionTigerMoves(board, piece);
    }

    const moves: { positions: Position[]; isJump: boolean }[] = [];
    const adjacentPositions = BoardHelper.getAdjacentPositions(piece.position);

    for (const pos of adjacentPositions) {
      const cell = BoardHelper.getCell(board, pos);
      if (!cell) continue;

      if (cell.type === 1 && piece.type !== PieceType.RAT) continue;

      if (cell.piece) {
        if (cell.piece.owner === piece.owner) continue;
        if (!BoardHelper.canCapture(piece, cell.piece, board)) continue;
      }

      moves.push({ positions: [pos], isJump: false });
    }

    return moves;
  }

  private static getLionTigerMoves(board: Board, piece: Piece): { positions: Position[]; isJump: boolean }[] {
    const moves: { positions: Position[]; isJump: boolean }[] = [];
    const adjacentPositions = BoardHelper.getAdjacentPositions(piece.position);

    for (const pos of adjacentPositions) {
      const cell = BoardHelper.getCell(board, pos);
      if (!cell) continue;

      if (cell.type === 1) {
        const jumpResult = GameRules.tryJumpRiver(board, piece, piece.position, pos);
        if (jumpResult) {
          moves.push(jumpResult);
        }
        continue;
      }

      if (cell.piece) {
        if (cell.piece.owner === piece.owner) continue;
        if (!BoardHelper.canCapture(piece, cell.piece, board)) continue;
      }

      moves.push({ positions: [pos], isJump: false });
    }

    return moves;
  }

  private static tryJumpRiver(
    board: Board,
    piece: Piece,
    from: Position,
    firstWater: Position
  ): { positions: Position[]; isJump: boolean } | null {
    const rowDiff = firstWater.row - from.row;
    const colDiff = firstWater.col - from.col;

    const firstWaterCell = BoardHelper.getCell(board, firstWater);
    if (!firstWaterCell) return null;

    if (firstWaterCell.piece && firstWaterCell.piece.type === PieceType.RAT) {
      return null;
    }

    const path: Position[] = [firstWater];
    let currentPos = { ...firstWater };

    while (true) {
      const nextPos = {
        row: currentPos.row + rowDiff,
        col: currentPos.col + colDiff
      };

      if (nextPos.row < 0 || nextPos.row >= BOARD_ROWS ||
          nextPos.col < 0 || nextPos.col >= BOARD_COLS) {
        return null;
      }

      const nextCell = BoardHelper.getCell(board, nextPos);
      if (!nextCell) return null;

      if (nextCell.type === 1) {
        if (nextCell.piece && nextCell.piece.type === PieceType.RAT) {
          return null;
        }
        path.push(nextPos);
        currentPos = nextPos;
      } else {
        if (nextCell.piece) {
          if (nextCell.piece.owner === piece.owner) return null;
          if (!BoardHelper.canCapture(piece, nextCell.piece, board)) return null;
        }

        path.push(nextPos);
        return { positions: path, isJump: true };
      }
    }
  }

  static makeMove(
    board: Board,
    piece: Piece,
    to: Position,
    turnNumber: number
  ): { board: Board; moveRecord: MoveRecord } {
    const newBoard = BoardHelper.cloneBoard(board);
    const fromPos = { ...piece.position };
    const targetCell = newBoard[to.row][to.col];

    let capturedPiece: Piece | null = null;
    if (targetCell.piece) {
      capturedPiece = { ...targetCell.piece, position: { ...targetCell.piece.position } };
    }

    newBoard[fromPos.row][fromPos.col].piece = null;

    const movedPiece = {
      ...piece,
      position: { ...to },
      inWater: targetCell.type === 1
    };
    newBoard[to.row][to.col].piece = movedPiece;

    const isJump = targetCell.type !== 1 && piece.type !== PieceType.RAT &&
                   Math.abs(to.row - fromPos.row) + Math.abs(to.col - fromPos.col) > 1;

    const moveRecord: MoveRecord = {
      pieceId: piece.id,
      pieceType: piece.type,
      owner: piece.owner,
      from: fromPos,
      to: { ...to },
      capturedPiece,
      isJump,
      turnNumber
    };

    return { board: newBoard, moveRecord };
  }

  static checkGameOver(board: Board, currentPlayer: Player): { isOver: boolean; winner: Player } {
    if (GameRules.isDenOccupied(board, Player.PLAYER1)) {
      return { isOver: true, winner: Player.PLAYER2 };
    }
    if (GameRules.isDenOccupied(board, Player.PLAYER2)) {
      return { isOver: true, winner: Player.PLAYER1 };
    }

    const player1Pieces = GameRules.countPieces(board, Player.PLAYER1);
    const player2Pieces = GameRules.countPieces(board, Player.PLAYER2);

    if (player1Pieces === 0) {
      return { isOver: true, winner: Player.PLAYER2 };
    }
    if (player2Pieces === 0) {
      return { isOver: true, winner: Player.PLAYER1 };
    }

    if (!GameRules.hasValidMoves(board, currentPlayer)) {
      return { isOver: true, winner: currentPlayer === Player.PLAYER1 ? Player.PLAYER2 : Player.PLAYER1 };
    }

    return { isOver: false, winner: Player.NONE };
  }

  private static isDenOccupied(board: Board, player: Player): boolean {
    const denPos = player === Player.PLAYER1
      ? { row: 0, col: 3 }
      : { row: 8, col: 3 };

    const cell = board[denPos.row][denPos.col];
    return cell.piece !== null && cell.piece.owner !== player;
  }

  private static countPieces(board: Board, player: Player): number {
    let count = 0;
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const cell = board[row][col];
        if (cell.piece && cell.piece.owner === player) {
          count++;
        }
      }
    }
    return count;
  }

  private static hasValidMoves(board: Board, player: Player): boolean {
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const cell = board[row][col];
        if (cell.piece && cell.piece.owner === player) {
          const moves = GameRules.getValidMoves(board, cell.piece);
          if (moves.length > 0) return true;
        }
      }
    }
    return false;
  }

  static getPieceAt(board: Board, pos: Position): Piece | null {
    const cell = BoardHelper.getCell(board, pos);
    return cell ? cell.piece : null;
  }

  static isValidMove(board: Board, piece: Piece, to: Position): boolean {
    const validMoves = GameRules.getValidMoves(board, piece);
    return validMoves.some(move => {
      const finalPos = move.positions[move.positions.length - 1];
      return finalPos.row === to.row && finalPos.col === to.col;
    });
  }
}
