export type EntityId = number;

export class Entity {
  private static nextId: EntityId = 0;
  public readonly id: EntityId;
  private components: Map<string, unknown> = new Map();

  constructor() {
    this.id = Entity.nextId++;
  }

  addComponent<T>(component: T): void {
    const key = (component as object).constructor.name;
    this.components.set(key, component);
  }

  removeComponent(componentName: string): void {
    this.components.delete(componentName);
  }

  getComponent<T>(componentName: string): T | undefined {
    return this.components.get(componentName) as T | undefined;
  }

  hasComponent(componentName: string): boolean {
    return this.components.has(componentName);
  }

  hasAllComponents(componentNames: string[]): boolean {
    return componentNames.every(name => this.components.has(name));
  }
}
