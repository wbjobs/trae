import {
  _decorator, Component, Node, Label, Button, EditBox, director,
  Prefab, instantiate, Color, Graphics, UITransform, Vec3
} from 'cc';
import { NetworkManager } from './NetworkManager';
import { BoardView } from './BoardView';
import {
  GameState, Player, Position, PieceType, PLAYER_NAMES, PLAYER_COLORS,
  PIECE_NAMES, WSMessageType
} from './types';

const { ccclass, property } = _decorator;

@ccclass('GameManager')
export class GameManager extends Component {
  @property(Node)
  mainMenuPanel: Node | null = null;

  @property(Node)
  matchingPanel: Node | null = null;

  @property(Node)
  gamePanel: Node | null = null;

  @property(Node)
  gameOverPanel: Node | null = null;

  @property(Node)
  spectatePanel: Node | null = null;

  @property(Node)
  reconnectPanel: Node | null = null;

  @property(BoardView)
  boardView: BoardView | null = null;

  @property(NetworkManager)
  networkManager: NetworkManager | null = null;

  @property(Label)
  currentPlayerLabel: Label | null = null;

  @property(Label)
  turnCountLabel: Label | null = null;

  @property(Label)
  player1NameLabel: Label | null = null;

  @property(Label)
  player2NameLabel: Label | null = null;

  @property(Label)
  matchingStatusLabel: Label | null = null;

  @property(Label)
  gameOverLabel: Label | null = null;

  @property(EditBox)
  playerNameEditBox: EditBox | null = null;

  @property(Node)
  spectateListContent: Node | null = null;

  @property(Prefab)
  spectateRoomItem: Prefab | null = null;

  @property(Node)
  aiPanel: Node | null = null;

  private currentGameState: GameState | null = null;
  private currentPlayerNumber: Player = Player.NONE;
  private isSpectator: boolean = false;
  private isAIGame: boolean = false;
  private aiDifficulty: string = 'easy';
  private selectedPosition: Position | null = null;
  private serverUrl: string = 'ws://localhost:8080/ws';

  onLoad(): void {
    this.networkManager = this.getComponent(NetworkManager) || new NetworkManager();
    this.networkManager.init(this.serverUrl);

    this.setupNetworkHandlers();
    this.showPanel(this.mainMenuPanel);
  }

  private setupNetworkHandlers(): void {
    if (!this.networkManager) return;

    this.networkManager.onMessage('connected', (data) => {
      console.log('Connected to server:', data.playerId);
    });

    this.networkManager.onMessage('match_success', (data) => {
      this.handleMatchSuccess(data);
    });

    this.networkManager.onMessage('match_failed', (data) => {
      this.handleMatchFailed(data);
    });

    this.networkManager.onMessage('game_state', (data: GameState) => {
      this.handleGameState(data);
    });

    this.networkManager.onMessage('move_result', (data) => {
      if (!data.success && data.error) {
        console.error('Move failed:', data.error);
      }
    });

    this.networkManager.onMessage('game_over', (data) => {
      this.handleGameOver(data);
    });

    this.networkManager.onMessage('player_disconnected', (data) => {
      console.log('Player disconnected:', data.playerId);
    });

    this.networkManager.onMessage('player_reconnected', (data) => {
      console.log('Player reconnected:', data.playerId);
    });

    this.networkManager.onMessage('reconnect_success', (data) => {
      this.handleReconnectSuccess(data);
    });

    this.networkManager.onMessage('reconnect_failed', (data) => {
      this.handleReconnectFailed(data);
    });

    this.networkManager.onMessage('spectate_list', (data) => {
      this.handleSpectateList(data);
    });

    this.networkManager.onMessage('spectate_enter', (data) => {
      this.handleSpectateEnter(data);
    });

    this.networkManager.onMessage('error', (data) => {
      console.error('Server error:', data.message);
    });

    this.networkManager.onMessage('ping', () => {
    });

    this.networkManager.onMessage('ai_match_success', (data) => {
      this.handleAIMatchSuccess(data);
    });
  }

  async startGame(): Promise<void> {
    const playerName = this.playerNameEditBox?.string || '玩家';
    this.showPanel(this.matchingPanel);

    if (this.matchingStatusLabel) {
      this.matchingStatusLabel.string = '正在匹配对手...';
    }

    const connected = await this.networkManager!.connect();
    if (!connected) {
      this.showError('无法连接到服务器');
      this.showPanel(this.mainMenuPanel);
      return;
    }

    this.networkManager!.requestMatch(playerName);

    this.startMatchingAnimation();
  }

  private startMatchingAnimation(): void {
    let dots = '';
    const timer = setInterval(() => {
      if (!this.matchingPanel || this.matchingPanel.active === false) {
        clearInterval(timer);
        return;
      }

      dots = dots.length >= 3 ? '' : dots + '.';
      if (this.matchingStatusLabel) {
        this.matchingStatusLabel.string = `正在匹配对手${dots}`;
      }
    }, 500);
  }

  cancelMatch(): void {
    this.networkManager?.cancelMatch();
    this.showPanel(this.mainMenuPanel);
  }

  openAIPanel(): void {
    this.isAIGame = false;
    this.aiDifficulty = 'easy';
    this.showPanel(this.aiPanel);
  }

  selectAIDifficulty(difficulty: string): void {
    this.aiDifficulty = difficulty;
  }

  async startAIGame(): Promise<void> {
    const playerName = this.playerNameEditBox?.string || '玩家';
    this.showPanel(this.matchingPanel);

    if (this.matchingStatusLabel) {
      this.matchingStatusLabel.string = '正在创建 AI 对局...';
    }

    const connected = await this.networkManager!.connect();
    if (!connected) {
      this.showError('无法连接到服务器');
      this.showPanel(this.mainMenuPanel);
      return;
    }

    this.isAIGame = true;
    this.networkManager!.requestAIMatch(playerName, this.aiDifficulty);
  }

  private handleAIMatchSuccess(data: any): void {
    if (this.matchingStatusLabel) {
      this.matchingStatusLabel.string = `匹配成功！对手: ${data.aiName}`;
    }

    setTimeout(() => {
      this.currentPlayerNumber = data.playerNumber;
      this.isSpectator = false;
      this.isAIGame = true;

      if (this.networkManager) {
        this.networkManager.setRoomId(data.roomId);
      }

      if (this.player1NameLabel) {
        this.player1NameLabel.string = '玩家';
      }
      if (this.player2NameLabel) {
        this.player2NameLabel.string = data.aiName;
      }

      this.showPanel(this.gamePanel);

      if (data.gameState) {
        this.handleGameState(data.gameState);
      }
    }, 500);
  }

  private handleMatchSuccess(data: any): void {
    if (this.matchingStatusLabel) {
      this.matchingStatusLabel.string = '匹配成功！';
    }

    setTimeout(() => {
      this.currentPlayerNumber = data.playerNumber;
      this.isSpectator = false;

      if (this.networkManager) {
        this.networkManager.setRoomId(data.roomId);
      }

      this.showPanel(this.gamePanel);

      if (data.gameState) {
        this.handleGameState(data.gameState);
      }
    }, 500);
  }

  private handleMatchFailed(data: any): void {
    this.showError(data.message || '匹配失败');
    this.showPanel(this.mainMenuPanel);
  }

  private handleGameState(gameState: GameState): void {
    this.currentGameState = gameState;

    if (this.boardView) {
      this.boardView.updateBoard(gameState.board, gameState.currentPlayer);
      this.boardView.setCurrentPlayer(gameState.currentPlayer);
    }

    if (this.currentPlayerLabel) {
      this.currentPlayerLabel.string = `当前回合: ${PLAYER_NAMES[gameState.currentPlayer]}`;
      this.currentPlayerLabel.color = new Color(PLAYER_COLORS[gameState.currentPlayer]);
    }

    if (this.turnCountLabel) {
      this.turnCountLabel.string = `回合数: ${gameState.turnCount}`;
    }
  }

  private handleGameOver(data: any): void {
    if (this.gameOverLabel) {
      if (data.winner === Player.NONE) {
        this.gameOverLabel.string = '平局！';
      } else if (data.winner === this.currentPlayerNumber) {
        this.gameOverLabel.string = '恭喜你获胜！';
      } else {
        this.gameOverLabel.string = '很遗憾，你输了';
      }
    }

    this.showPanel(this.gameOverPanel);
  }

  onCellSelected(event: any): void {
    if (this.isSpectator) return;
    if (!this.currentGameState) return;
    if (this.currentGameState.currentPlayer !== this.currentPlayerNumber) return;

    const { position, piece } = event;
    this.selectedPosition = position;

    if (this.boardView) {
      const moves = this.calculateValidMoves(position);
      this.boardView.setValidMoves(position, moves);
    }
  }

  onMoveRequested(event: any): void {
    if (this.isSpectator) return;
    if (!this.currentGameState) return;
    if (this.currentGameState.currentPlayer !== this.currentPlayerNumber) return;

    const { from, to } = event;

    if (this.isAIGame) {
      this.networkManager?.makeAIMove(from, to);
    } else {
      this.networkManager?.makeMove(from, to);
    }

    this.selectedPosition = null;
  }

  private calculateValidMoves(pos: Position): Position[] {
    if (!this.currentGameState) return [];

    const cell = this.currentGameState.board[pos.row][pos.col];
    if (!cell.piece) return [];

    const moves: Position[] = [];
    const directions = [
      { row: -1, col: 0 },
      { row: 1, col: 0 },
      { row: 0, col: -1 },
      { row: 0, col: 1 }
    ];

    for (const dir of directions) {
      const newPos = { row: pos.row + dir.row, col: pos.col + dir.col };
      if (this.isValidPosition(newPos)) {
        moves.push(newPos);
      }
    }

    return moves;
  }

  private isValidPosition(pos: Position): boolean {
    return pos.row >= 0 && pos.row < 9 && pos.col >= 0 && pos.col < 8;
  }

  restartGame(): void {
    this.currentGameState = null;
    this.selectedPosition = null;
    this.showPanel(this.mainMenuPanel);
  }

  backToMenu(): void {
    if (this.isAIGame) {
      this.networkManager?.leaveAIGame();
    }
    this.networkManager?.disconnect();
    this.currentGameState = null;
    this.selectedPosition = null;
    this.isAIGame = false;
    this.showPanel(this.mainMenuPanel);
  }

  openSpectateMode(): void {
    this.isSpectator = true;
    this.showPanel(this.spectatePanel);
    this.networkManager?.requestSpectateList();
  }

  private handleSpectateList(data: any): void {
    if (!this.spectateListContent) return;

    this.spectateListContent.removeAllChildren();

    if (data.rooms && data.rooms.length > 0) {
      data.rooms.forEach((room: any) => {
        this.addSpectateRoomItem(room);
      });
    } else {
      const noRoomsLabel = new Node('NoRooms');
      noRoomsLabel.addComponent(UITransform);
      const label = noRoomsLabel.addComponent(Label);
      label.string = '暂无可观看的对局';
      label.fontSize = 24;
      noRoomsLabel.setPosition(new Vec3(0, 0, 0));
      this.spectateListContent.addChild(noRoomsLabel);
    }
  }

  private addSpectateRoomItem(room: any): void {
    if (!this.spectateListContent) return;

    let itemNode: Node;
    if (this.spectateRoomItem) {
      itemNode = instantiate(this.spectateRoomItem);
    } else {
      itemNode = new Node(`Room_${room.id}`);
      itemNode.addComponent(UITransform);

      const bgNode = new Node('Background');
      bgNode.addComponent(UITransform);
      bgNode.addComponent(Graphics);
      itemNode.addChild(bgNode);

      const labelNode = new Node('Label');
      labelNode.addComponent(UITransform);
      const label = labelNode.addComponent(Label);
      label.string = `房间 ${room.id.substring(0, 8)}`;
      label.fontSize = 20;
      itemNode.addChild(labelNode);

      const button = itemNode.addComponent(Button);
      button.transition = Button.Transition.SCALE;

      const bgTransform = bgNode.getComponent(UITransform)!;
      bgTransform.setContentSize(300, 60);

      const bg = bgNode.getComponent(Graphics)!;
      bg.fillColor = new Color(100, 100, 100, 200);
      bg.roundRect(-150, -30, 300, 60, 8);
      bg.fill();

      itemNode.on(Node.EventType.TOUCH_END, () => {
        this.enterSpectateRoom(room.id);
      });
    }

    this.spectateListContent.addChild(itemNode);
  }

  async enterSpectateRoom(roomId: string): Promise<void> {
    const playerName = this.playerNameEditBox?.string || '观众';
    const connected = await this.networkManager!.connect();

    if (connected) {
      this.networkManager?.enterSpectate(roomId, playerName);
    }
  }

  private handleSpectateEnter(data: any): void {
    this.isSpectator = true;
    this.currentPlayerNumber = Player.NONE;

    if (this.networkManager) {
      this.networkManager.setRoomId(data.roomId);
    }

    this.showPanel(this.gamePanel);

    if (data.gameState) {
      this.handleGameState(data.gameState);
    }

    if (this.player1NameLabel && data.players) {
      const player1 = data.players.find((p: any) => p.playerNumber === Player.PLAYER1);
      const player2 = data.players.find((p: any) => p.playerNumber === Player.PLAYER2);

      if (player1) this.player1NameLabel.string = `红方: ${player1.name}`;
      if (player2) this.player2NameLabel.string = `蓝方: ${player2.name}`;
    }
  }

  private handleReconnectSuccess(data: any): void {
    if (this.reconnectPanel) {
      this.reconnectPanel.active = false;
    }

    this.currentPlayerNumber = data.playerNumber;

    if (data.gameState) {
      this.handleGameState(data.gameState);
    }

    this.showPanel(this.gamePanel);
  }

  private handleReconnectFailed(data: any): void {
    this.showError(data.error || '重连失败');
    this.backToMenu();
  }

  attemptReconnect(): void {
    const roomId = this.networkManager?.getRoomId();
    if (roomId) {
      this.networkManager?.requestReconnect(roomId);
    }
  }

  private showPanel(panel: Node | null): void {
    [this.mainMenuPanel, this.matchingPanel, this.gamePanel,
     this.gameOverPanel, this.spectatePanel, this.reconnectPanel,
     this.aiPanel].forEach(p => {
      if (p) {
        p.active = p === panel;
      }
    });
  }

  private showError(message: string): void {
    console.error(message);
  }

  onDestroy(): void {
    this.networkManager?.cleanup();
  }

  getCurrentPlayerNumber(): Player {
    return this.currentPlayerNumber;
  }

  isPlayerTurn(): boolean {
    return this.currentGameState?.currentPlayer === this.currentPlayerNumber;
  }
}
