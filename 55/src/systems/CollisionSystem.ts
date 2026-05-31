import { System, World } from '../ecs';
import { PositionComponent, MovableComponent, RenderComponent } from '../components';
import { BSPDungeon } from '../game/BSPDungeon';

export class CollisionSystem extends System {
  constructor(private dungeon: BSPDungeon) {
    super();
  }

  update(world: World, deltaTime: number): void {
    const entities = world.getEntitiesWithComponents([
      'PositionComponent',
      'MovableComponent',
    ]);

    for (const entity of entities) {
      const position = entity.getComponent<PositionComponent>('PositionComponent');
      const movable = entity.getComponent<MovableComponent>('MovableComponent');
      const render = entity.getComponent<RenderComponent>('RenderComponent');

      if (!position || !movable) continue;

      const entitySize = render?.size ?? 0.8;

      const predictedX = position.x + movable.velocityX * deltaTime;
      const predictedY = position.y + movable.velocityY * deltaTime;

      const canMoveX = this.canOccupy(predictedX, position.y, entitySize);
      const canMoveY = this.canOccupy(position.x, predictedY, entitySize);

      if (canMoveX) {
        position.x = predictedX;
      }

      if (canMoveY) {
        position.y = predictedY;
      }

      movable.velocityX = 0;
      movable.velocityY = 0;
    }
  }

  private canOccupy(x: number, y: number, size: number): boolean {
    const minTileX = Math.floor(x);
    const maxTileX = Math.floor(x + size - 0.001);
    const minTileY = Math.floor(y);
    const maxTileY = Math.floor(y + size - 0.001);

    for (let tileY = minTileY; tileY <= maxTileY; tileY++) {
      for (let tileX = minTileX; tileX <= maxTileX; tileX++) {
        if (!this.dungeon.isWalkable(tileX, tileY)) {
          return false;
        }
      }
    }

    return true;
  }
}
