import { World } from './World';

export abstract class System {
  abstract update(world: World, deltaTime: number): void;
}
