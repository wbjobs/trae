import { World } from './ecs';
import { PositionComponent, RenderComponent, MovableComponent, FieldOfViewComponent } from './components';
import { MovementSystem, CollisionSystem, RenderSystem, FieldOfViewSystem } from './systems';
import { BSPDungeon } from './game/BSPDungeon';

const DUNGEON_WIDTH = 50;
const DUNGEON_HEIGHT = 50;

function main(): void {
  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  if (!canvas) {
    console.error('Canvas element not found');
    return;
  }

  const dungeon = new BSPDungeon(DUNGEON_WIDTH, DUNGEON_HEIGHT);
  dungeon.generate();

  console.log(`Generated ${dungeon.rooms.length} rooms`);

  const world = new World();

  const player = world.createEntity();
  const startRoom = dungeon.getRandomRoom();
  player.addComponent(new PositionComponent(startRoom.centerX, startRoom.centerY));
  player.addComponent(new RenderComponent('#4ade80', 0.8));
  player.addComponent(new MovableComponent(8));
  player.addComponent(new FieldOfViewComponent(8));

  world.addSystem(new MovementSystem());
  world.addSystem(new CollisionSystem(dungeon));
  world.addSystem(new FieldOfViewSystem(dungeon));
  world.addSystem(new RenderSystem(canvas, dungeon));

  let lastTime = performance.now();

  function gameLoop(currentTime: number): void {
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    world.update(deltaTime);

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);
}

window.addEventListener('DOMContentLoaded', main);
