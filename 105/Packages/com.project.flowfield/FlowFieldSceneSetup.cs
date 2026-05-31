using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;

namespace FlowField
{
    public class FlowFieldSceneSetup : MonoBehaviour
    {
        [Header("Grid Settings")]
        public int gridSizeX = 200;
        public int gridSizeZ = 200;
        public float cellSize = 1.0f;
        public float3 origin = float3.zero;

        [Header("Unit Settings")]
        public int unitCount = 100000;
        public float minSpeed = 2.0f;
        public float maxSpeed = 5.0f;

        [Header("Obstacle Settings")]
        public int obstacleCount = 20;

        [Header("LOD Settings")]
        public float highResDistance = 50.0f;
        public Transform lodReference;

        [Header("Display Settings")]
        public bool showHUD = true;

        private EntityManager _entityManager;
        private bool _initialized;

        void Start()
        {
            Initialize();
        }

        void Initialize()
        {
            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return;

            _entityManager = world.EntityManager;

            CreateConfigEntity();
            CreateStatsEntity();
            CreateLODReferenceEntity();
            CreateUnits();
            CreateObstacles();

            if (showHUD)
            {
                gameObject.AddComponent<PerformanceHUD>();
            }

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
                LowResPathfindingTime = 0,
                HighResUnitCount = 0,
                LowResUnitCount = 0,
                FrameCount = 0,
                DeltaTime = 0
            });
        }

        void CreateLODReferenceEntity()
        {
            var entity = _entityManager.CreateEntity();
            float3 refPos = lodReference != null ? lodReference.position : new float3(gridSizeX * cellSize * 0.5f, 0, gridSizeZ * cellSize * 0.5f);
            _entityManager.AddComponentData(entity, new LODReference
            {
                Position = refPos,
                HighResDistance = highResDistance
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
                typeof(Radius),
                typeof(UnitLOD)
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
                _entityManager.SetComponentData(entity, new UnitLOD
                {
                    Level = 0
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

        void OnDrawGizmos()
        {
            if (!Application.isPlaying) return;

            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return;

            var entityManager = world.EntityManager;

            var obstacleQuery = entityManager.CreateEntityQuery(ComponentType.ReadOnly<Obstacle>());
            var obstacles = obstacleQuery.ToComponentDataArray<Obstacle>(Unity.Collections.Allocator.Temp);

            Gizmos.color = Color.red;
            for (int i = 0; i < obstacles.Length; i++)
            {
                Gizmos.DrawWireSphere(obstacles[i].Position, obstacles[i].Radius);
            }

            obstacles.Dispose();

            Gizmos.color = Color.blue;
            float gridWidth = gridSizeX * cellSize;
            float gridHeight = gridSizeZ * cellSize;
            Gizmos.DrawWireCube(
                new Vector3(origin.x + gridWidth / 2, 0, origin.z + gridHeight / 2),
                new Vector3(gridWidth, 1, gridHeight)
            );

            Gizmos.color = Color.yellow;
            float3 refPos = lodReference != null ? lodReference.position : new float3(gridWidth * 0.5f, 0, gridHeight * 0.5f);
            Gizmos.DrawWireSphere(new Vector3(refPos.x, refPos.y, refPos.z), highResDistance);
        }
    }
}
