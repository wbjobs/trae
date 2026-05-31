import { _decorator, Component, director } from 'cc';
import { GameManager } from './GameManager';
import { NetworkManager } from './NetworkManager';
import { BoardView } from './BoardView';

const { ccclass } = _decorator;

@ccclass('Main')
export class Main extends Component {
  onLoad(): void {
    const scene = director.getScene();
    if (!scene) return;

    const canvas = scene.getChildByName('Canvas');
    if (!canvas) return;

    let networkManager = canvas.getComponent(NetworkManager);
    if (!networkManager) {
      networkManager = canvas.addComponent(NetworkManager);
    }

    let gameManager = canvas.getComponent(GameManager);
    if (!gameManager) {
      gameManager = canvas.addComponent(GameManager);
    }

    const boardViewNode = canvas.getChildByName('BoardView');
    if (boardViewNode) {
      let boardView = boardViewNode.getComponent(BoardView);
      if (!boardView) {
        boardView = boardViewNode.addComponent(BoardView);
      }

      if (gameManager) {
        gameManager['boardView'] = boardView;
      }
    }

    if (gameManager) {
      gameManager['networkManager'] = networkManager;
      this.setupGameManager(gameManager, canvas);
    }
  }

  private setupGameManager(gameManager: GameManager, canvas: any): void {
    const mainMenuPanel = canvas.getChildByName('MainMenuPanel');
    const matchingPanel = canvas.getChildByName('MatchingPanel');
    const gamePanel = canvas.getChildByName('GamePanel');
    const gameOverPanel = canvas.getChildByName('GameOverPanel');
    const spectatePanel = canvas.getChildByName('SpectatePanel');
    const reconnectPanel = canvas.getChildByName('ReconnectPanel');

    gameManager['mainMenuPanel'] = mainMenuPanel;
    gameManager['matchingPanel'] = matchingPanel;
    gameManager['gamePanel'] = gamePanel;
    gameManager['gameOverPanel'] = gameOverPanel;
    gameManager['spectatePanel'] = spectatePanel;
    gameManager['reconnectPanel'] = reconnectPanel;

    if (matchingPanel) {
      const matchingStatusLabel = matchingPanel.getChildByName('MatchingStatusLabel')?.getComponent('cc.Label');
      gameManager['matchingStatusLabel'] = matchingStatusLabel;
    }

    if (gamePanel) {
      const currentPlayerLabel = gamePanel.getChildByName('CurrentPlayerLabel')?.getComponent('cc.Label');
      const turnCountLabel = gamePanel.getChildByName('TurnCountLabel')?.getComponent('cc.Label');
      const player1NameLabel = gamePanel.getChildByName('Player1NameLabel')?.getComponent('cc.Label');
      const player2NameLabel = gamePanel.getChildByName('Player2NameLabel')?.getComponent('cc.Label');

      gameManager['currentPlayerLabel'] = currentPlayerLabel;
      gameManager['turnCountLabel'] = turnCountLabel;
      gameManager['player1NameLabel'] = player1NameLabel;
      gameManager['player2NameLabel'] = player2NameLabel;
    }

    if (gameOverPanel) {
      const gameOverLabel = gameOverPanel.getChildByName('GameOverLabel')?.getComponent('cc.Label');
      gameManager['gameOverLabel'] = gameOverLabel;
    }

    if (mainMenuPanel) {
      const playerNameEditBox = mainMenuPanel.getChildByName('PlayerNameEditBox')?.getComponent('cc.EditBox');
      gameManager['playerNameEditBox'] = playerNameEditBox;
    }

    if (spectatePanel) {
      const spectateListContent = spectatePanel.getChildByName('SpectateList')?.getChildByName('Content');
      gameManager['spectateListContent'] = spectateListContent;
    }
  }
}
