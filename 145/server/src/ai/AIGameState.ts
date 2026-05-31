import {
  Board, Piece, PieceType, Player, Position, GameState, MoveRecord,
  BOARD_ROWS, BOARD_COLS, PIECE_RANK
} from '../types';
import { BoardHelper } from './Board';
import { GameRules } from './Rules';

export interface Move {
  from: Position;
  to: Position;
  pieceId: string;
  pieceType: PieceType;
}

export interface GameStateForAI {
  board: Board;
  currentPlayer: Player;
  isGameOver: boolean;
  winner: Player;
}

export class AIGameState {
  private board: Board;
  private currentPlayer: Player;
  private isGameOver: boolean;
  private winner: Player;

  constructor(board: Board, currentPlayer: Player, isGameOver: boolean, winner: Player) {
    this.board = BoardHelper.cloneBoard(board);
    this.currentPlayer = currentPlayer;
    this.isGameOver = isGameOver;
    this.winner = winner;
  }

  static fromGameState(state: GameState): AIGameState {
    return new AIGameState(state.board, state.currentPlayer, state.isGameOver, state.winner);
  }

  getBoard(): Board {
    return this.board;
  }

  getCurrentPlayer(): Player {
    return this.currentPlayer;
  }

  isOver(): boolean {
    return this.isGameOver;
  }

  getWinner(): Player {
    return this.winner;
  }

  getPossibleMoves(player: Player): Move[] {
    const moves: Move[] = [];

    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const cell = this.board[row][col];
        if (cell.piece && cell.piece.owner === player) {
          const piece = cell.piece;
          const validMoves = GameRules.getValidMoves(this.board, piece);

          validMoves.forEach(move => {
            const finalPos = move.positions[move.positions.length - 1];
            moves.push({
              from: { row, col },
              to: finalPos,
              pieceId: piece.id,
              pieceType: piece.type
            });
          });
        }
      }
    }

    return moves;
  }

  applyMove(move: Move): AIGameState {
    const piece = this.board[move.from.row][move.from.col].piece;
    if (!piece) return this;

    const { board: newBoard } = GameRules.makeMove(
      this.board,
      piece,
      move.to,
      0
    );

    const newCurrentPlayer = this.currentPlayer === Player.PLAYER1
      ? Player.PLAYER2
      : Player.PLAYER1;

    const result = GameRules.checkGameOver(newBoard, newCurrentPlayer);

    return new AIGameState(newBoard, newCurrentPlayer, result.isOver, result.winner);
  }

  clone(): AIGameState {
    return new AIGameState(this.board, this.currentPlayer, this.isGameOver, this.winner);
  }

  evaluate(player: Player): number {
    if (this.isGameOver) {
      if (this.winner === player) return 1000;
      if (this.winner === Player.NONE) return 0;
      return -1000;
    }

    let score = 0;
    const opponent = player === Player.PLAYER1 ? Player.PLAYER2 : Player.PLAYER1;

    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const cell = this.board[row][col];
        if (cell.piece) {
          const pieceValue = PIECE_RANK[cell.piece.type] * 10;
          if (cell.piece.owner === player) {
            score += pieceValue;

            if (BoardHelper.isTrap({ row, col }, player)) {
              score -= 5;
            }
            if (cell.piece.inWater && cell.piece.type === PieceType.RAT) {
              score += 5;
            }
            if (cell.piece.type === PieceType.RAT && BoardHelper.isWater({ row, col })) {
              score += 3;
            }
          } else if (cell.piece.owner === opponent) {
            score -= pieceValue;
          }
        }
      }
    }

    const opponentDen = player === Player.PLAYER1
      ? { row: 8, col: 3 }
      : { row: 0, col: 3 };

    let minDistToDen = Infinity;
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const cell = this.board[row][col];
        if (cell.piece && cell.piece.owner === player) {
          const dist = Math.abs(row - opponentDen.row) + Math.abs(col - opponentDen.col);
          if (dist < minDistToDen) {
            minDistToDen = dist;
          }
        }
      }
    }

    if (minDistToDen !== Infinity) {
      score += (20 - minDistToDen) * 2;
    }

    return score;
  }
}
