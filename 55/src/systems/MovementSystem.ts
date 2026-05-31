import { System, World } from '../ecs';
import { PositionComponent, MovableComponent } from '../components';

export class MovementSystem extends System {
  private keys: Set<string> = new Set();

  constructor() {
    super();
    this.setupInputListeners();
  }

  private setupInputListeners(): void {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
  }

  update(world: World, _deltaTime: number): void {
    const entities = world.getEntitiesWithComponents([
      'PositionComponent',
      'MovableComponent',
    ]);

    for (const entity of entities) {
      const position = entity.getComponent<PositionComponent>('PositionComponent');
      const movable = entity.getComponent<MovableComponent>('MovableComponent');

      if (!position || !movable) continue;

      let dx = 0;
      let dy = 0;

      if (this.keys.has('w') || this.keys.has('arrowup')) dy -= 1;
      if (this.keys.has('s') || this.keys.has('arrowdown')) dy += 1;
      if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= 1;
      if (this.keys.has('d') || this.keys.has('arrowright')) dx += 1;

      if (dx !== 0 && dy !== 0) {
        dx *= 0.7071;
        dy *= 0.7071;
      }

      movable.velocityX = dx * movable.speed;
      movable.velocityY = dy * movable.speed;
    }
  }
}
