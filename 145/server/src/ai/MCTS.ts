import { AIGameState, Move } from './AIGameState';
import { Player, Position } from '../types';

interface MCTSNode {
  state: AIGameState;
  parent: MCTSNode | null;
  children: MCTSNode[];
  move: Move | null;
  player: Player;
  visits: number;
  wins: number;
  untriedMoves: Move[];
}

export class MCTS {
  private readonly UCB1_CONSTANT = Math.SQRT2;
  private aiPlayer: Player;

  constructor(aiPlayer: Player) {
    this.aiPlayer = aiPlayer;
  }

  search(
    initialState: AIGameState,
    iterations: number,
    maxDepth: number = 50
  ): Move | null {
    const root: MCTSNode = this.createNode(initialState, null, null);

    for (let i = 0; i < iterations; i++) {
      const node = this.select(root);
      const expandedNode = this.expand(node);
      const result = this.simulate(expandedNode, maxDepth);
      this.backpropagate(expandedNode, result);
    }

    const bestChild = this.getBestChild(root, 0);
    return bestChild ? bestChild.move : null;
  }

  private createNode(
    state: AIGameState,
    parent: MCTSNode | null,
    move: Move | null
  ): MCTSNode {
    const player = state.getCurrentPlayer();
    return {
      state: state.clone(),
      parent,
      children: [],
      move,
      player,
      visits: 0,
      wins: 0,
      untriedMoves: state.getPossibleMoves(player)
    };
  }

  private select(node: MCTSNode): MCTSNode {
    while (node.untriedMoves.length === 0 && node.children.length > 0) {
      node = this.getBestChild(node, this.UCB1_CONSTANT);
    }
    return node;
  }

  private expand(node: MCTSNode): MCTSNode {
    if (node.untriedMoves.length === 0 || node.state.isOver()) {
      return node;
    }

    const randomIndex = Math.floor(Math.random() * node.untriedMoves.length);
    const move = node.untriedMoves.splice(randomIndex, 1)[0];

    const newState = node.state.applyMove(move);
    const childNode = this.createNode(newState, node, move);

    node.children.push(childNode);
    return childNode;
  }

  private simulate(node: MCTSNode, maxDepth: number): number {
    let currentState = node.state.clone();
    let depth = 0;

    while (!currentState.isOver() && depth < maxDepth) {
      const moves = currentState.getPossibleMoves(currentState.getCurrentPlayer());

      if (moves.length === 0) break;

      const move = this.selectMoveByHeuristic(currentState, moves);
      currentState = currentState.applyMove(move);
      depth++;
    }

    return currentState.evaluate(this.aiPlayer);
  }

  private selectMoveByHeuristic(state: AIGameState, moves: Move[]): Move {
    const player = state.getCurrentPlayer();
    const opponent = player === Player.PLAYER1 ? Player.PLAYER2 : Player.PLAYER1;
    const board = state.getBoard();

    let bestMove = moves[0];
    let bestScore = -Infinity;

    for (const move of moves) {
      let score = Math.random() * 10;

      const targetCell = board[move.to.row][move.to.col];
      if (targetCell.piece && targetCell.piece.owner !== player) {
        const attackerRank = this.getPieceRank(move.pieceType);
        const defenderRank = this.getPieceRank(targetCell.piece.type);
        score += 50 + (attackerRank - defenderRank) * 10;
      }

      const opponentDen = player === Player.PLAYER1
        ? { row: 8, col: 3 }
        : { row: 0, col: 3 };

      const distToDen = Math.abs(move.to.row - opponentDen.row) + Math.abs(move.to.col - opponentDen.col);
      score += (20 - distToDen) * 2;

      const currentDistToDen = Math.abs(move.from.row - opponentDen.row) + Math.abs(move.from.col - opponentDen.col);
      score += (currentDistToDen - distToDen) * 5;

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove;
  }

  private getPieceRank(type: number): number {
    const ranks = [1, 2, 3, 4, 5, 6, 7, 8];
    return ranks[type] || 1;
  }

  private backpropagate(node: MCTSNode, result: number): void {
    while (node !== null) {
      node.visits++;

      if (node.parent && node.parent.player === this.aiPlayer) {
        node.wins += result;
      } else if (!node.parent && node.player === this.aiPlayer) {
        node.wins += result;
      }

      node = node.parent!;
    }
  }

  private getBestChild(node: MCTSNode, explorationConstant: number): MCTSNode {
    let bestChild = node.children[0];
    let bestScore = -Infinity;

    for (const child of node.children) {
      const score = this.UCB1(child, node, explorationConstant);
      if (score > bestScore) {
        bestScore = score;
        bestChild = child;
      }
    }

    return bestChild;
  }

  private UCB1(child: MCTSNode, parent: MCTSNode, explorationConstant: number): number {
    if (child.visits === 0) {
      return Infinity;
    }

    const exploitation = child.wins / child.visits;
    const exploration = explorationConstant *
      Math.sqrt(Math.log(parent.visits) / child.visits);

    return exploitation + exploration;
  }
}
