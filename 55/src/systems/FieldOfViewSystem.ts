import { System, World } from '../ecs';
import { PositionComponent, FieldOfViewComponent } from '../components';
import { BSPDungeon, TileType } from '../game/BSPDungeon';

export class FieldOfViewSystem extends System {
  constructor(private dungeon: BSPDungeon) {
    super();
  }

  update(world: World, _deltaTime: number): void {
    const entities = world.getEntitiesWithComponents([
      'PositionComponent',
      'FieldOfViewComponent',
    ]);

    for (const entity of entities) {
      const position = entity.getComponent<PositionComponent>('PositionComponent');
      const fov = entity.getComponent<FieldOfViewComponent>('FieldOfViewComponent');

      if (!position || !fov) continue;

      fov.clearVisible();

      const centerX = Math.floor(position.x + 0.5);
      const centerY = Math.floor(position.y + 0.5);

      fov.addVisible(centerX, centerY);

      for (let angle = 0; angle < 360; angle += 1) {
        const rad = (angle * Math.PI) / 180;
        const dirX = Math.cos(rad);
        const dirY = Math.sin(rad);

        this.castRay(centerX, centerY, dirX, dirY, fov.radius, fov);
      }
    }
  }

  private castRay(
    startX: number,
    startY: number,
    dirX: number,
    dirY: number,
    maxDistance: number,
    fov: FieldOfViewComponent
  ): void {
    let x = startX;
    let y = startY;

    const stepX = dirX > 0 ? 1 : -1;
    const stepY = dirY > 0 ? 1 : -1;

    const tDeltaX = Math.abs(1 / dirX);
    const tDeltaY = Math.abs(1 / dirY);

    let tMaxX = dirX > 0
      ? (Math.floor(startX) + 1 - startX) * tDeltaX
      : (startX - Math.floor(startX)) * tDeltaX;
    let tMaxY = dirY > 0
      ? (Math.floor(startY) + 1 - startY) * tDeltaY
      : (startY - Math.floor(startY)) * tDeltaY;

    let distance = 0;

    while (distance <= maxDistance) {
      fov.addVisible(Math.floor(x), Math.floor(y));

      if (this.dungeon.tiles[Math.floor(y)]?.[Math.floor(x)] === TileType.WALL) {
        break;
      }

      if (tMaxX < tMaxY) {
        x += stepX;
        distance = tMaxX;
        tMaxX += tDeltaX;
      } else {
        y += stepY;
        distance = tMaxY;
        tMaxY += tDeltaY;
      }
    }
  }
}
