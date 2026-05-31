import { System, World } from '../ecs';
import { PositionComponent, RenderComponent, FieldOfViewComponent } from '../components';
import { BSPDungeon, TileType } from '../game/BSPDungeon';

export class RenderSystem extends System {
  private ctx: CanvasRenderingContext2D;
  private tileSize: number;

  constructor(
    private canvas: HTMLCanvasElement,
    private dungeon: BSPDungeon
  ) {
    super();
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Failed to get 2D context');
    this.ctx = context;
    this.tileSize = Math.floor(Math.min(canvas.width, canvas.height) / dungeon.width);
  }

  update(world: World, _deltaTime: number): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const fovEntities = world.getEntitiesWithComponents(['FieldOfViewComponent']);
    const playerFov = fovEntities[0]?.getComponent<FieldOfViewComponent>('FieldOfViewComponent');

    this.renderDungeon(playerFov);
    this.renderEntities(world, playerFov);
  }

  private renderDungeon(fov?: FieldOfViewComponent): void {
    for (let y = 0; y < this.dungeon.height; y++) {
      for (let x = 0; x < this.dungeon.width; x++) {
        const tile = this.dungeon.tiles[y][x];
        const px = x * this.tileSize;
        const py = y * this.tileSize;

        const isVisible = fov?.isVisible(x, y) ?? true;
        const isExplored = fov?.isExplored(x, y) ?? true;

        if (!isExplored) {
          this.ctx.fillStyle = '#000000';
        } else if (!isVisible) {
          if (tile === TileType.WALL) {
            this.ctx.fillStyle = '#1a1a2e';
          } else {
            this.ctx.fillStyle = '#2a2a4e';
          }
        } else {
          if (tile === TileType.WALL) {
            this.ctx.fillStyle = '#2d2d44';
          } else {
            this.ctx.fillStyle = '#4a4a6a';
          }
        }

        this.ctx.fillRect(px, py, this.tileSize, this.tileSize);

        if (tile === TileType.FLOOR && isExplored) {
          this.ctx.strokeStyle = isVisible ? '#3a3a5a' : '#22223a';
          this.ctx.lineWidth = 1;
          this.ctx.strokeRect(px, py, this.tileSize, this.tileSize);
        }
      }
    }
  }

  private renderEntities(world: World, fov?: FieldOfViewComponent): void {
    const entities = world.getEntitiesWithComponents([
      'PositionComponent',
      'RenderComponent',
    ]);

    for (const entity of entities) {
      const position = entity.getComponent<PositionComponent>('PositionComponent');
      const render = entity.getComponent<RenderComponent>('RenderComponent');

      if (!position || !render) continue;

      const tileX = Math.floor(position.x + 0.5);
      const tileY = Math.floor(position.y + 0.5);
      const isVisible = fov?.isVisible(tileX, tileY) ?? true;

      if (!isVisible && fov) continue;

      const px = position.x * this.tileSize;
      const py = position.y * this.tileSize;
      const size = render.size * this.tileSize;
      const offset = (this.tileSize - size) / 2;

      this.ctx.fillStyle = render.color;
      this.ctx.fillRect(px + offset, py + offset, size, size);

      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(px + offset, py + offset, size, size);
    }
  }
}
