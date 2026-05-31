using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using UnityEngine;

namespace FlowField
{
    public class Bootstrap : MonoBehaviour
    {
        public int UnitCount = 100000;
        public int GridSizeX = 200;
        public int GridSizeZ = 200;
        public float CellSize = 1.0f;
        public float3 Origin = new float3(0, 0, 0);
        public int ObstacleCount = 20;
        public float MinSpeed = 2.0f;
        public float MaxSpeed = 5.0f;

        private EntityManager _entityManager;
        private Entity _configEntity;
        private Entity _statsEntity;

        void Start()
        {
            var world = World.DefaultGameObjectInjectionWorld;
            _entityManager = world.EntityManager;

            CreateConfigEntity();
            CreateStatsEntity();
            CreateUnits();
            CreateObstacles();

            var systemGroup = world.GetOrCreateSystem<SimulationSystemGroup>();
            systemGroup.AddSystemToUpdateList(world.GetOrCreateSystem<MovingObstacleSystem>());
            systemGroup.AddSystemToUpdateList(world.GetOrCreateSystem<FlowFieldSystem>());
            systemGroup.AddSystemToUpdateList(world.GetOrCreateSystem<UnitMovementSystem>());
            systemGroup.AddSystemToUpdateList(world.GetOrCreateSystem<PerformanceStatsSystem>());
            systemGroup.AddSystemToUpdateList(world.GetOrCreateSystem<DisplaySystem>());
        }

        void CreateConfigEntity()
        {
            _configEntity = _entityManager.CreateEntity();
            _entityManager.AddComponentData(_configEntity, new GridConfig
            {
                GridSizeX = GridSizeX,
                GridSizeZ = GridSizeZ,
                CellSize = CellSize,
                Origin = Origin
            });
        }

        void CreateStatsEntity()
        {
            _statsEntity = _entityManager.CreateEntity();
            _entityManager.AddComponentData(_statsEntity, new PerformanceStats
            {
                FPS = 0,
                AverageSpeed = 0,
                PathfindingTime = 0,
                FrameCount = 0,
                DeltaTime = 0
            });
        }

        void CreateUnits()
        {
            float gridWidth = GridSizeX * CellSize;
            float gridHeight = GridSizeZ * CellSize;

            var units = _entityManager.CreateEntity(
                ComponentType.ReadWrite<LocalTransform>(),
                ComponentType.ReadWrite<Unit>(),
                ComponentType.ReadWrite<Target>(),
                ComponentType.ReadWrite<Speed>(),
                ComponentType.ReadWrite<Radius>()
            );

            var unitArchetype = _entityManager.CreateArchetype(
                typeof(LocalTransform),
                typeof(Unit),
                typeof(Target),
                typeof(Speed),
                typeof(Radius)
            );

            using var entities = _entityManager.CreateEntity(unitArchetype, UnitCount, Allocator.Temp);

            for (int i = 0; i < UnitCount; i++)
            {
                var entity = entities[i];

                float3 startPos = new float3(
                    Origin.x + Random.value * gridWidth,
                    0,
                    Origin.z + Random.value * gridHeight
                );

                float3 endPos = new float3(
                    Origin.x + Random.value * gridWidth,
                    0,
                    Origin.z + Random.value * gridHeight
                );

                _entityManager.SetComponentData(entity, LocalTransform.FromPosition(startPos));
                _entityManager.SetComponentData(entity, new Unit
                {
                    Velocity = float3.zero,
                    CurrentDirection = float3.zero
                });
                _entityManager.SetComponentData(entity, new Target
                {
                    Destination = endPos,
                    HasReachedDestination = false
                });
                _entityManager.SetComponentData(entity, new Speed
                {
                    Value = MinSpeed + Random.value * (MaxSpeed - MinSpeed)
                });
                _entityManager.SetComponentData(entity, new Radius
                {
                    Value = 0.5f
                });
            }
        }

        void CreateObstacles()
        {
            float gridWidth = GridSizeX * CellSize;
            float gridHeight = GridSizeZ * CellSize;

            var obstacleArchetype = _entityManager.CreateArchetype(
                typeof(Obstacle),
                typeof(MovingObstacle)
            );

            using var entities = _entityManager.CreateEntity(obstacleArchetype, ObstacleCount, Allocator.Temp);

            for (int i = 0; i < ObstacleCount; i++)
            {
                var entity = entities[i];

                float3 origin = new float3(
                    Origin.x + 20 + Random.value * (gridWidth - 40),
                    0,
                    Origin.z + 20 + Random.value * (gridHeight - 40)
                );

                float radius = 3 + Random.value * 5;

                _entityManager.SetComponentData(entity, new Obstacle
                {
                    Position = origin,
                    Radius = radius
                });
                _entityManager.SetComponentData(entity, new MovingObstacle
                {
                    Velocity = float3.zero,
                    Origin = origin,
                    MovementRange = 10 + Random.value * 15,
                    Phase = Random.value * math.PI * 2
                });
            }
        }
    }
}
