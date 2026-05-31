import { AIGameState, Move } from './AIGameState';
import { MCTS } from './MCTS';
import { GameState, Player, Position, PieceType } from '../types';
import { BoardHelper } from '../game/Board';
import { GameRules } from '../game/Rules';

export enum AIDifficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard'
}

export const AI_CONFIG: Record<AIDifficulty, {
  iterations: number;
  maxDepth: number;
  thinkTime: number;
  name: string;
}> = {
  [AIDifficulty.EASY]: {
    iterations: 100,
    maxDepth: 10,
    thinkTime: 500,
    name: '简单 AI'
  },
  [AIDifficulty.MEDIUM]: {
    iterations: 1000,
    maxDepth: 25,
    thinkTime: 1500,
    name: '中等 AI'
  },
  [AIDifficulty.HARD]: {
    iterations: 10000,
    maxDepth: 50,
    thinkTime: 3000,
    name: '困难 AI'
  }
};

export class AIManager {
  private mcts: MCTS;
  private difficulty: AIDifficulty;
  private aiPlayer: Player;

  constructor(aiPlayer: Player, difficulty: AIDifficulty) {
    this.aiPlayer = aiPlayer;
    this.difficulty = difficulty;
    this.mcts = new MCTS(aiPlayer);
  }

  getDifficulty(): AIDifficulty {
    return this.difficulty;
  }

  getAIName(): string {
    return AI_CONFIG[this.difficulty].name;
  }

  getAIPlayer(): Player {
    return this.aiPlayer;
  }

  async calculateMove(gameState: GameState): Promise<Move | null> {
    const config = AI_CONFIG[this.difficulty];

    await this.delay(config.thinkTime);

    const aiState = AIGameState.fromGameState(gameState);

    return this.mcts.search(
      aiState,
      config.iterations,
      config.maxDepth
    );
  }

  calculateMoveSync(gameState: GameState): Move | null {
    const aiState = AIGameState.fromGameState(gameState);

    if (this.difficulty === AIDifficulty.EASY) {
      return this.calculateEasyMove(aiState);
    }

    const config = AI_CONFIG[this.difficulty];
    return this.mcts.search(aiState, config.iterations, config.maxDepth);
  }

  private calculateEasyMove(state: AIGameState): Move | null {
    const moves = state.getPossibleMoves(this.aiPlayer);

    if (moves.length === 0) return null;

    return this.selectGreedyMove(state, moves);
  }

  private selectGreedyMove(state: AIGameState, moves: Move[]): Move {
    const board = state.getBoard();
    let bestMove = moves[0];
    let bestScore = -Infinity;

    for (const move of moves) {
      let score = Math.random() * 5;

      const targetCell = board[move.to.row][move.to.col];
      if (targetCell.piece && targetCell.piece.owner !== this.aiPlayer) {
        const pieceRanks = [1, 2, 3, 4, 5, 6, 7, 8];
        const attackerRank = pieceRanks[move.pieceType] || 1;
        const defenderRank = pieceRanks[targetCell.piece.type] || 1;

        if (attackerRank >= defenderRank) {
          score += 30 + (attackerRank - defenderRank) * 5;
        } else if (move.pieceType === PieceType.RAT && targetCell.piece.type === PieceType.ELEPHANT) {
          score += 50;
        } else {
          score -= 20;
        }
      }

      const opponentDen = this.aiPlayer === Player.PLAYER1
        ? { row: 8, col: 3 }
        : { row: 0, col: 3 };

      const distToDen = Math.abs(move.to.row - opponentDen.row) + Math.abs(move.to.col - opponentDen.col);
      const currentDistToDen = Math.abs(move.from.row - opponentDen.row) + Math.abs(move.from.col - opponentDen.col);

      score += (currentDistToDen - distToDen) * 3;

      if (BoardHelper.isTrap(move.to, this.aiPlayer)) {
        score -= 10;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
