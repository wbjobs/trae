import { Entity } from './Entity';
import { System } from './System';

export class World {
  private entities: Map<number, Entity> = new Map();
  private systems: System[] = [];

  createEntity(): Entity {
    const entity = new Entity();
    this.entities.set(entity.id, entity);
    return entity;
  }

  removeEntity(entityId: number): void {
    this.entities.delete(entityId);
  }

  getEntity(entityId: number): Entity | undefined {
    return this.entities.get(entityId);
  }

  getAllEntities(): Entity[] {
    return Array.from(this.entities.values());
  }

  getEntitiesWithComponents(componentNames: string[]): Entity[] {
    return Array.from(this.entities.values()).filter(entity =>
      entity.hasAllComponents(componentNames)
    );
  }

  addSystem(system: System): void {
    this.systems.push(system);
  }

  update(deltaTime: number): void {
    for (const system of this.systems) {
      system.update(this, deltaTime);
    }
  }
}
