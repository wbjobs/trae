import {
  _decorator, Component, Node, Graphics, Label, Sprite, SpriteFrame,
  UITransform, Vec3, Color, instantiate, Prefab, resources, Layers
} from 'cc';
import {
  Board, Piece, Player, Position, CellType, PieceType,
  PIECE_NAMES, PIECE_RANK, PLAYER_COLORS, BOARD_ROWS, BOARD_COLS,
  WATER_CELLS, TRAP_CELLS_PLAYER1, TRAP_CELLS_PLAYER2, DEN_PLAYER1, DEN_PLAYER2
} from './types';

const { ccclass, property } = _decorator;

@ccclass('BoardView')
export class BoardView extends Component {
  @property(Node)
  boardContainer: Node | null = null;

  @property(Prefab)
  cellPrefab: Prefab | null = null;

  @property(Prefab)
  piecePrefab: Prefab | null = null;

  private cellNodes: Node[][] = [];
  private pieceNodes: Map<string, Node> = new Map();
  private selectedCell: Position | null = null;
  private validMoves: Position[] = [];
  private currentPlayer: Player = Player.NONE;
  private boardData: Board | null = null;

  readonly CELL_SIZE = 70;
  readonly BOARD_OFFSET_X = -280;
  readonly BOARD_OFFSET_Y = -315;

  onLoad(): void {
    this.createBoard();
  }

  private createBoard(): void {
    if (!this.boardContainer) return;

    for (let row = 0; row < BOARD_ROWS; row++) {
      this.cellNodes[row] = [];
      for (let col = 0; col < BOARD_COLS; col++) {
        const cellNode = this.createCell(row, col);
        this.cellNodes[row][col] = cellNode;
        this.boardContainer.addChild(cellNode);
      }
    }
  }

  private createCell(row: number, col: number): Node {
    let cellNode: Node;

    if (this.cellPrefab) {
      cellNode = instantiate(this.cellPrefab);
    } else {
      cellNode = new Node(`Cell_${row}_${col}`);
      cellNode.addComponent(UITransform);
      cellNode.addComponent(Graphics);

      const graphics = cellNode.getComponent(Graphics)!;
      const cellType = this.getCellType(row, col);

      let fillColor: Color;
      switch (cellType) {
        case CellType.WATER:
          fillColor = new Color(64, 164, 223, 255);
          break;
        case CellType.TRAP_PLAYER1:
        case CellType.TRAP_PLAYER2:
          fillColor = new Color(255, 200, 100, 255);
          break;
        case CellType.DEN_PLAYER1:
        case CellType.DEN_PLAYER2:
          fillColor = new Color(255, 100, 100, 255);
          break;
        default:
          fillColor = (row + col) % 2 === 0
            ? new Color(245, 222, 179, 255)
            : new Color(222, 184, 135, 255);
      }

      graphics.fillColor = fillColor;
      graphics.fillRect(-this.CELL_SIZE / 2, -this.CELL_SIZE / 2, this.CELL_SIZE, this.CELL_SIZE);

      graphics.strokeColor = new Color(139, 90, 43, 255);
      graphics.lineWidth = 2;
      graphics.rect(-this.CELL_SIZE / 2, -this.CELL_SIZE / 2, this.CELL_SIZE, this.CELL_SIZE);
      graphics.stroke();
    }

    const transform = cellNode.getComponent(UITransform)!;
    transform.setContentSize(this.CELL_SIZE, this.CELL_SIZE);

    const posX = this.BOARD_OFFSET_X + col * this.CELL_SIZE + this.CELL_SIZE / 2;
    const posY = this.BOARD_OFFSET_Y + (BOARD_ROWS - 1 - row) * this.CELL_SIZE + this.CELL_SIZE / 2;
    cellNode.setPosition(new Vec3(posX, posY, 0));

    cellNode.on(Node.EventType.TOUCH_END, () => {
      this.onCellClick(row, col);
    });

    return cellNode;
  }

  private getCellType(row: number, col: number): CellType {
    const pos = { row, col };

    if (WATER_CELLS.some(w => w.row === row && w.col === col)) {
      return CellType.WATER;
    }
    if (TRAP_CELLS_PLAYER1.some(t => t.row === row && t.col === col)) {
      return CellType.TRAP_PLAYER1;
    }
    if (TRAP_CELLS_PLAYER2.some(t => t.row === row && t.col === col)) {
      return CellType.TRAP_PLAYER2;
    }
    if (pos.row === DEN_PLAYER1.row && pos.col === DEN_PLAYER1.col) {
      return CellType.DEN_PLAYER1;
    }
    if (pos.row === DEN_PLAYER2.row && pos.col === DEN_PLAYER2.col) {
      return CellType.DEN_PLAYER2;
    }

    return CellType.NORMAL;
  }

  updateBoard(board: Board, currentPlayer: Player): void {
    this.boardData = board;
    this.currentPlayer = currentPlayer;

    this.clearPieces();

    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const cell = board[row][col];
        if (cell.piece) {
          this.createPiece(cell.piece);
        }
      }
    }

    this.clearSelection();
  }

  private createPiece(piece: Piece): void {
    let pieceNode: Node;

    if (this.piecePrefab) {
      pieceNode = instantiate(this.piecePrefab);
    } else {
      pieceNode = new Node(`Piece_${piece.id}`);
      pieceNode.addComponent(UITransform);

      const bgNode = new Node('Background');
      bgNode.addComponent(UITransform);
      bgNode.addComponent(Graphics);
      pieceNode.addChild(bgNode);

      const labelNode = new Node('Label');
      labelNode.addComponent(UITransform);
      const label = labelNode.addComponent(Label);
      label.string = PIECE_NAMES[piece.type];
      label.fontSize = 36;
      label.lineHeight = 40;
      label.color = piece.owner === Player.PLAYER1 ? new Color(255, 255, 255, 255) : new Color(255, 255, 255, 255);
      pieceNode.addChild(labelNode);

      const rankNode = new Node('Rank');
      rankNode.addComponent(UITransform);
      const rankLabel = rankNode.addComponent(Label);
      rankLabel.string = PIECE_RANK[piece.type].toString();
      rankLabel.fontSize = 16;
      rankLabel.lineHeight = 20;
      rankLabel.color = new Color(255, 255, 0, 255);
      pieceNode.addChild(rankNode);

      const bgTransform = bgNode.getComponent(UITransform)!;
      bgTransform.setContentSize(this.CELL_SIZE - 10, this.CELL_SIZE - 10);

      const bg = bgNode.getComponent(Graphics)!;
      const color = new Color(PLAYER_COLORS[piece.owner]);
      bg.fillColor = color;
      bg.roundRect(-(this.CELL_SIZE - 10) / 2, -(this.CELL_SIZE - 10) / 2, this.CELL_SIZE - 10, this.CELL_SIZE - 10, 8);
      bg.fill();

      bg.strokeColor = new Color(0, 0, 0, 200);
      bg.lineWidth = 2;
      bg.roundRect(-(this.CELL_SIZE - 10) / 2, -(this.CELL_SIZE - 10) / 2, this.CELL_SIZE - 10, this.CELL_SIZE - 10, 8);
      bg.stroke();

      labelNode.setPosition(new Vec3(0, 5, 0));
      rankNode.setPosition(new Vec3(0, -20, 0));
    }

    const transform = pieceNode.getComponent(UITransform)!;
    transform.setContentSize(this.CELL_SIZE - 10, this.CELL_SIZE - 10);

    const posX = this.BOARD_OFFSET_X + piece.position.col * this.CELL_SIZE + this.CELL_SIZE / 2;
    const posY = this.BOARD_OFFSET_Y + (BOARD_ROWS - 1 - piece.position.row) * this.CELL_SIZE + this.CELL_SIZE / 2;
    pieceNode.setPosition(new Vec3(posX, posY, 0));

    if (this.boardContainer) {
      this.boardContainer.addChild(pieceNode);
    }

    this.pieceNodes.set(piece.id, pieceNode);
  }

  private clearPieces(): void {
    this.pieceNodes.forEach(node => {
      node.destroy();
    });
    this.pieceNodes.clear();
  }

  setValidMoves(from: Position, moves: Position[]): void {
    this.clearSelection();
    this.selectedCell = from;
    this.validMoves = moves;

    this.highlightCell(from, new Color(0, 255, 0, 100));

    moves.forEach(pos => {
      this.highlightCell(pos, new Color(255, 255, 0, 100));
    });
  }

  clearSelection(): void {
    if (this.selectedCell) {
      this.clearCellHighlight(this.selectedCell);
    }

    this.validMoves.forEach(pos => {
      this.clearCellHighlight(pos);
    });

    this.selectedCell = null;
    this.validMoves = [];
  }

  private highlightCell(pos: Position, color: Color): void {
    const cellNode = this.cellNodes[pos.row]?.[pos.col];
    if (!cellNode) return;

    let highlight = cellNode.getChildByName('Highlight');
    if (!highlight) {
      highlight = new Node('Highlight');
      highlight.addComponent(UITransform);
      highlight.addComponent(Graphics);
      cellNode.addChild(highlight);
    }

    const transform = highlight.getComponent(UITransform)!;
    transform.setContentSize(this.CELL_SIZE - 4, this.CELL_SIZE - 4);

    const graphics = highlight.getComponent(Graphics)!;
    graphics.clear();
    graphics.fillColor = color;
    graphics.fillRect(-(this.CELL_SIZE - 4) / 2, -(this.CELL_SIZE - 4) / 2, this.CELL_SIZE - 4, this.CELL_SIZE - 4);
  }

  private clearCellHighlight(pos: Position): void {
    const cellNode = this.cellNodes[pos.row]?.[pos.col];
    if (!cellNode) return;

    const highlight = cellNode.getChildByName('Highlight');
    if (highlight) {
      highlight.destroy();
    }
  }

  private onCellClick(row: number, col: number): void {
    if (!this.boardData) return;

    const pos = { row, col };
    const cell = this.boardData[row][col];

    if (this.selectedCell && this.validMoves.some(m => m.row === row && m.col === col)) {
      this.node.emit('move', { from: this.selectedCell, to: pos });
      this.clearSelection();
      return;
    }

    if (cell.piece && cell.piece.owner === this.currentPlayer) {
      this.node.emit('pieceSelected', { position: pos, piece: cell.piece });
    } else if (this.selectedCell) {
      this.clearSelection();
    }
  }

  setCurrentPlayer(player: Player): void {
    this.currentPlayer = player;
  }

  getSelectedCell(): Position | null {
    return this.selectedCell;
  }

  animateMove(from: Position, to: Position, pieceId: string): void {
    const pieceNode = this.pieceNodes.get(pieceId);
    if (!pieceNode) return;

    const posX = this.BOARD_OFFSET_X + to.col * this.CELL_SIZE + this.CELL_SIZE / 2;
    const posY = this.BOARD_OFFSET_Y + (BOARD_ROWS - 1 - to.row) * this.CELL_SIZE + this.CELL_SIZE / 2;

    pieceNode.setPosition(new Vec3(posX, posY, 0));
  }

  removePiece(pieceId: string): void {
    const pieceNode = this.pieceNodes.get(pieceId);
    if (pieceNode) {
      pieceNode.destroy();
      this.pieceNodes.delete(pieceId);
    }
  }
}
