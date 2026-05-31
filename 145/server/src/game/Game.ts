import { Board, GameState, Piece, Player, Position, MoveRecord } from '../types';
import { BoardHelper } from './Board';
import { GameRules } from './Rules';

export class Game {
  private board: Board;
  private pieces: Map<string, Piece>;
  private currentPlayer: Player;
  private isGameOver: boolean;
  private winner: Player;
  private turnCount: number;
  private moveHistory: MoveRecord[];

  constructor() {
    this.board = BoardHelper.createBoard();
    this.pieces = new Map();
    this.currentPlayer = Player.PLAYER1;
    this.isGameOver = false;
    this.winner = Player.NONE;
    this.turnCount = 0;
    this.moveHistory = [];

    const initialPieces = BoardHelper.initPieces(this.board);
    initialPieces.forEach(p => this.pieces.set(p.id, p));
  }

  getState(): GameState {
    return {
      board: this.board,
      currentPlayer: this.currentPlayer,
      isGameOver: this.isGameOver,
      winner: this.winner,
      turnCount: this.turnCount,
      moveHistory: [...this.moveHistory]
    };
  }

  makeMove(player: Player, from: Position, to: Position): { success: boolean; error?: string } {
    if (this.isGameOver) {
      return { success: false, error: '游戏已结束' };
    }

    if (player !== this.currentPlayer) {
      return { success: false, error: '不是你的回合' };
    }

    const piece = GameRules.getPieceAt(this.board, from);
    if (!piece) {
      return { success: false, error: '该位置没有棋子' };
    }

    if (piece.owner !== player) {
      return { success: false, error: '这不是你的棋子' };
    }

    if (!GameRules.isValidMove(this.board, piece, to)) {
      return { success: false, error: '无效的移动' };
    }

    const { board: newBoard, moveRecord } = GameRules.makeMove(
      this.board,
      piece,
      to,
      this.turnCount + 1
    );

    this.board = newBoard;
    this.turnCount++;
    this.moveHistory.push(moveRecord);

    if (moveRecord.capturedPiece) {
      this.pieces.delete(moveRecord.capturedPiece.id);
    }

    const movedPiece = this.pieces.get(piece.id);
    if (movedPiece) {
      movedPiece.position = { ...to };
      movedPiece.inWater = moveRecord.isJump ? false : this.board[to.row][to.col].type === 1;
    }

    const result = GameRules.checkGameOver(this.board, this.currentPlayer);
    if (result.isOver) {
      this.isGameOver = true;
      this.winner = result.winner;
    } else {
      this.currentPlayer = this.currentPlayer === Player.PLAYER1 ? Player.PLAYER2 : Player.PLAYER1;
    }

    return { success: true };
  }

  getPieceById(id: string): Piece | undefined {
    return this.pieces.get(id);
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

  getValidMoves(pos: Position): Position[] {
    const piece = GameRules.getPieceAt(this.board, pos);
    if (!piece) return [];

    const moves = GameRules.getValidMoves(this.board, piece);
    return moves.map(m => m.positions[m.positions.length - 1]);
  }
}
