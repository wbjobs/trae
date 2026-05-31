export type EntityId = number

export interface IComponent {}

export interface IComponentStorage<T extends IComponent> {
  get(entity: EntityId): T | undefined
  set(entity: EntityId, value: T): void
  has(entity: EntityId): boolean
  delete(entity: EntityId): void
  entities(): EntityId[]
}

export type ComponentType<T extends IComponent> = new (...args: any[]) => T

export interface ISystem {
  init(): void
  update(dt: number): void
  destroy(): void
}
