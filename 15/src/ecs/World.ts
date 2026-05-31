import { EntityId, IComponent, IComponentStorage, ISystem, ComponentType } from './types'

class ComponentStorage<T extends IComponent> implements IComponentStorage<T> {
  private storage = new Map<EntityId, T>()
  
  get(entity: EntityId): T | undefined {
    return this.storage.get(entity)
  }
  
  set(entity: EntityId, value: T): void {
    this.storage.set(entity, value)
  }
  
  has(entity: EntityId): boolean {
    return this.storage.has(entity)
  }
  
  delete(entity: EntityId): void {
    this.storage.delete(entity)
  }
  
  entities(): EntityId[] {
    return Array.from(this.storage.keys())
  }
}

export class World {
  private nextEntityId: EntityId = 0
  private entities = new Set<EntityId>()
  private components = new Map<ComponentType<IComponent>, IComponentStorage<IComponent>>()
  private systems: ISystem[] = []
  private entityComponentMask = new Map<EntityId, Set<ComponentType<IComponent>>>()
  
  public createEntity(): EntityId {
    const entity = this.nextEntityId++
    this.entities.add(entity)
    this.entityComponentMask.set(entity, new Set())
    return entity
  }
  
  public destroyEntity(entity: EntityId): void {
    this.entities.delete(entity)
    const mask = this.entityComponentMask.get(entity)
    if (mask) {
      for (const type of mask) {
        const storage = this.components.get(type)
        if (storage) {
          storage.delete(entity)
        }
      }
    }
    this.entityComponentMask.delete(entity)
  }
  
  public hasEntity(entity: EntityId): boolean {
    return this.entities.has(entity)
  }
  
  public addComponent<T extends IComponent>(entity: EntityId, type: ComponentType<T>, component?: T): T {
    let storage = this.components.get(type) as IComponentStorage<T> | undefined
    if (!storage) {
      storage = new ComponentStorage<T>()
      this.components.set(type, storage)
    }
    
    const comp = component ?? new type()
    storage.set(entity, comp)
    
    const mask = this.entityComponentMask.get(entity)
    if (mask) {
      mask.add(type)
    }
    
    return comp
  }
  
  public getComponent<T extends IComponent>(entity: EntityId, type: ComponentType<T>): T | undefined {
    const storage = this.components.get(type) as IComponentStorage<T> | undefined
    return storage?.get(entity)
  }
  
  public hasComponent<T extends IComponent>(entity: EntityId, type: ComponentType<T>): boolean {
    const mask = this.entityComponentMask.get(entity)
    return mask?.has(type) ?? false
  }
  
  public removeComponent<T extends IComponent>(entity: EntityId, type: ComponentType<T>): void {
    const storage = this.components.get(type)
    if (storage) {
      storage.delete(entity)
    }
    
    const mask = this.entityComponentMask.get(entity)
    if (mask) {
      mask.delete(type)
    }
  }
  
  public query<T extends IComponent>(...types: ComponentType<T>[]): EntityId[] {
    let entities: EntityId[] | null = null
    
    for (const type of types) {
      const storage = this.components.get(type)
      if (!storage) return []
      
      const typeEntities = storage.entities()
      if (!entities) {
        entities = typeEntities
      } else {
        const mask = this.entityComponentMask
        entities = entities.filter(e => {
          const eMask = mask.get(e)
          return eMask && types.every(t => eMask.has(t))
        })
      }
    }
    
    return entities ?? []
  }
  
  public addSystem(system: ISystem): void {
    this.systems.push(system)
  }
  
  public init(): void {
    for (const system of this.systems) {
      system.init()
    }
  }
  
  public update(dt: number): void {
    for (const system of this.systems) {
      system.update(dt)
    }
  }
  
  public destroy(): void {
    for (const system of this.systems) {
      system.destroy()
    }
    this.systems = []
    this.entities.clear()
    this.components.clear()
    this.entityComponentMask.clear()
  }
  
  public get entitiesCount(): number {
    return this.entities.size
  }
}
