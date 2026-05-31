using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;

namespace FlowField
{
    public class SceneInitializer : MonoBehaviour
    {
        [Header("Grid Settings")]
        public int gridSizeX = 200;
        public int gridSizeZ = 200;
        public float cellSize = 1.0f;
        public float3 origin = new float3(0, 0, 0);

        [Header("Unit Settings")]
        public int unitCount = 100000;
        public float minSpeed = 2.0f;
        public float maxSpeed = 5.0f;

        [Header("Obstacle Settings")]
        public int obstacleCount = 20;

        private EntityManager _entityManager;
        private bool _initialized;

        void Awake()
        {
            InitializeWorld();
        }

        void InitializeWorld()
        {
            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return;

            _entityManager = world.EntityManager;

            CreateConfigEntity();
            CreateStatsEntity();
            CreateUnits();
            CreateObstacles();

            _initialized = true;
        }

        void CreateConfigEntity()
        {
            var entity = _entityManager.CreateEntity();
            _entityManager.AddComponentData(entity, new GridConfig
            {
                GridSizeX = gridSizeX,
                GridSizeZ = gridSizeZ,
                CellSize = cellSize,
                Origin = origin
            });
        }

        void CreateStatsEntity()
        {
            var entity = _entityManager.CreateEntity();
            _entityManager.AddComponentData(entity, new PerformanceStats
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
            float gridWidth = gridSizeX * cellSize;
            float gridHeight = gridSizeZ * cellSize;

            var unitArchetype = _entityManager.CreateArchetype(
                typeof(Unity.Transforms.LocalTransform),
                typeof(Unit),
                typeof(Target),
                typeof(Speed),
                typeof(Radius)
            );

            var entities = _entityManager.CreateEntity(unitArchetype, unitCount, Unity.Collections.Allocator.Temp);

            for (int i = 0; i < unitCount; i++)
            {
                var entity = entities[i];

                float3 startPos = new float3(
                    origin.x + Random.value * gridWidth,
                    0,
                    origin.z + Random.value * gridHeight
                );

                float3 endPos = new float3(
                    origin.x + Random.value * gridWidth,
                    0,
                    origin.z + Random.value * gridHeight
                );

                _entityManager.SetComponentData(entity, Unity.Transforms.LocalTransform.FromPosition(startPos));
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
                    Value = minSpeed + Random.value * (maxSpeed - minSpeed)
                });
                _entityManager.SetComponentData(entity, new Radius
                {
                    Value = 0.5f
                });
            }

            entities.Dispose();
        }

        void CreateObstacles()
        {
            float gridWidth = gridSizeX * cellSize;
            float gridHeight = gridSizeZ * cellSize;

            var obstacleArchetype = _entityManager.CreateArchetype(
                typeof(Obstacle),
                typeof(MovingObstacle)
            );

            var entities = _entityManager.CreateEntity(obstacleArchetype, obstacleCount, Unity.Collections.Allocator.Temp);

            for (int i = 0; i < obstacleCount; i++)
            {
                var entity = entities[i];

                float3 obstacleOrigin = new float3(
                    origin.x + 20 + Random.value * (gridWidth - 40),
                    0,
                    origin.z + 20 + Random.value * (gridHeight - 40)
                );

                float radius = 3 + Random.value * 5;

                _entityManager.SetComponentData(entity, new Obstacle
                {
                    Position = obstacleOrigin,
                    Radius = radius
                });
                _entityManager.SetComponentData(entity, new MovingObstacle
                {
                    Velocity = float3.zero,
                    Origin = obstacleOrigin,
                    MovementRange = 10 + Random.value * 15,
                    Phase = Random.value * math.PI * 2
                });
            }

            entities.Dispose();
        }
    }
}
