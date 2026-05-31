using System;
using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace FlowField
{
    [BurstCompile]
    public struct GenerateLowResIntegrationFieldJob : IJobParallelFor
    {
        public int GridSizeX;
        public int GridSizeZ;
        public float CellSize;
        public float3 Origin;
        public int DestinationCellIndex;

        [ReadOnly] public NativeArray<float3> ObstaclePositions;
        [ReadOnly] public NativeArray<float> ObstacleRadii;

        public NativeArray<short> Costs;
        public NativeArray<short> IntegrationCosts;
        public NativeArray<bool> Blocked;

        public void Execute(int index)
        {
            int x = index % GridSizeX;
            int z = index / GridSizeX;

            float3 cellPos = Origin + new float3(x * CellSize, 0, z * CellSize);

            bool isBlocked = false;
            float obstacleInflation = CellSize * 0.3f;

            for (int i = 0; i < ObstaclePositions.Length; i++)
            {
                float dist = math.distance(cellPos, ObstaclePositions[i]);
                if (dist < ObstacleRadii[i] + CellSize * 0.5f + obstacleInflation)
                {
                    isBlocked = true;
                    break;
                }
            }

            Blocked[index] = isBlocked;
            Costs[index] = isBlocked ? (short)255 : (short)1;
            IntegrationCosts[index] = short.MaxValue;
        }
    }

    [BurstCompile]
    public struct LowResDijkstraJob : IJob
    {
        public int GridSizeX;
        public int GridSizeZ;
        public int DestinationCellIndex;

        public NativeArray<short> IntegrationCosts;
        [ReadOnly] public NativeArray<short> Costs;
        [ReadOnly] public NativeArray<bool> Blocked;

        public void Execute()
        {
            IntegrationCosts[DestinationCellIndex] = 0;

            var openSet = new NativeList<int>(Allocator.Temp);
            var visited = new NativeArray<bool>(IntegrationCosts.Length, Allocator.Temp);

            openSet.Add(DestinationCellIndex);
            visited[DestinationCellIndex] = true;

            while (openSet.Length > 0)
            {
                int currentIdx = -1;
                short minCost = short.MaxValue;

                for (int i = 0; i < openSet.Length; i++)
                {
                    int idx = openSet[i];
                    if (IntegrationCosts[idx] < minCost)
                    {
                        minCost = IntegrationCosts[idx];
                        currentIdx = idx;
                    }
                }

                if (currentIdx == -1) break;

                openSet.RemoveAt(FindIndex(openSet, currentIdx));

                int currentX = currentIdx % GridSizeX;
                int currentZ = currentIdx / GridSizeX;

                for (int dz = -1; dz <= 1; dz++)
                {
                    for (int dx = -1; dx <= 1; dx++)
                    {
                        if (dx == 0 && dz == 0) continue;

                        int neighborX = currentX + dx;
                        int neighborZ = currentZ + dz;

                        if (neighborX < 0 || neighborX >= GridSizeX || neighborZ < 0 || neighborZ >= GridSizeZ)
                            continue;

                        int neighborIdx = neighborZ * GridSizeX + neighborX;

                        if (visited[neighborIdx]) continue;
                        if (Blocked[neighborIdx]) continue;

                        short moveCost = (dx != 0 && dz != 0) ? (short)14 : (short)10;
                        short newCost = (short)(IntegrationCosts[currentIdx] + moveCost);

                        if (newCost < IntegrationCosts[neighborIdx])
                        {
                            IntegrationCosts[neighborIdx] = newCost;
                        }

                        openSet.Add(neighborIdx);
                        visited[neighborIdx] = true;
                    }
                }
            }

            openSet.Dispose();
            visited.Dispose();
        }

        private int FindIndex(NativeList<int> list, int value)
        {
            for (int i = 0; i < list.Length; i++)
            {
                if (list[i] == value) return i;
            }
            return -1;
        }
    }

    [BurstCompile]
    public struct CalculateLowResFlowFieldDirectionsJob : IJobParallelFor
    {
        public int GridSizeX;
        public int GridSizeZ;

        [ReadOnly] public NativeArray<short> IntegrationCosts;
        [ReadOnly] public NativeArray<bool> Blocked;

        public NativeArray<float2> Directions;

        public void Execute(int index)
        {
            if (Blocked[index] || IntegrationCosts[index] >= short.MaxValue)
            {
                Directions[index] = float2.zero;
                return;
            }

            int x = index % GridSizeX;
            int z = index / GridSizeX;

            float2 bestDir = float2.zero;
            short lowestCost = IntegrationCosts[index];

            for (int dz = -1; dz <= 1; dz++)
            {
                for (int dx = -1; dx <= 1; dx++)
                {
                    if (dx == 0 && dz == 0) continue;

                    int neighborX = x + dx;
                    int neighborZ = z + dz;

                    if (neighborX < 0 || neighborX >= GridSizeX || neighborZ < 0 || neighborZ >= GridSizeZ)
                        continue;

                    int neighborIdx = neighborZ * GridSizeX + neighborX;

                    if (Blocked[neighborIdx]) continue;

                    if (IntegrationCosts[neighborIdx] < lowestCost)
                    {
                        lowestCost = IntegrationCosts[neighborIdx];
                        bestDir = math.normalize(new float2(dx, dz));
                    }
                }
            }

            Directions[index] = bestDir;
        }
    }

    [BurstCompile]
    public struct UpdateUnitLODJob : IJobParallelFor
    {
        public float3 ReferencePosition;
        public float HighResDistance;

        [ReadOnly] public NativeArray<float3> Positions;
        public NativeArray<byte> LODLevels;

        public void Execute(int index)
        {
            float dist = math.distance(Positions[index], ReferencePosition);
            LODLevels[index] = dist > HighResDistance ? (byte)1 : (byte)0;
        }
    }

    [UpdateInGroup(typeof(FlowFieldSimulationGroup)), UpdateAfter(typeof(MovingObstacleSystem)), UpdateBefore(typeof(FlowFieldSystem))]
    public partial struct LowResFlowFieldSystem : ISystem
    {
        private NativeArray<short> _costs;
        private NativeArray<short> _integrationCosts;
        private NativeArray<bool> _blocked;
        private NativeArray<float2> _directions;

        public static NativeArray<float2> GlobalLowResDirections;
        public static int LowResGridSizeX;
        public static int LowResGridSizeZ;
        public static float LowResCellSize;
        public static float3 LowResOrigin;

        private System.Diagnostics.Stopwatch _stopwatch;
        private int _frameCounter;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<GridConfig>();
            _stopwatch = new System.Diagnostics.Stopwatch();
            _frameCounter = 0;
        }

        public void OnDestroy(ref SystemState state)
        {
            if (_costs.IsCreated) _costs.Dispose();
            if (_integrationCosts.IsCreated) _integrationCosts.Dispose();
            if (_blocked.IsCreated) _blocked.Dispose();
            if (_directions.IsCreated) _directions.Dispose();
        }

        public void OnUpdate(ref SystemState state)
        {
            _frameCounter++;

            if (_frameCounter % 2 != 0)
            {
                return;
            }

            _stopwatch.Restart();

            var config = SystemAPI.GetSingleton<GridConfig>();

            int lowResGridX = math.max(1, config.GridSizeX / 2);
            int lowResGridZ = math.max(1, config.GridSizeZ / 2);
            float lowResCellSize = config.CellSize * 2.0f;

            LowResGridSizeX = lowResGridX;
            LowResGridSizeZ = lowResGridZ;
            LowResCellSize = lowResCellSize;
            LowResOrigin = config.Origin;

            int totalCells = lowResGridX * lowResGridZ;

            if (!_costs.IsCreated || _costs.Length != totalCells)
            {
                if (_costs.IsCreated) _costs.Dispose();
                _costs = new NativeArray<short>(totalCells, Allocator.Persistent);
            }
            if (!_integrationCosts.IsCreated || _integrationCosts.Length != totalCells)
            {
                if (_integrationCosts.IsCreated) _integrationCosts.Dispose();
                _integrationCosts = new NativeArray<short>(totalCells, Allocator.Persistent);
            }
            if (!_blocked.IsCreated || _blocked.Length != totalCells)
            {
                if (_blocked.IsCreated) _blocked.Dispose();
                _blocked = new NativeArray<bool>(totalCells, Allocator.Persistent);
            }
            if (!_directions.IsCreated || _directions.Length != totalCells)
            {
                if (_directions.IsCreated) _directions.Dispose();
                _directions = new NativeArray<float2>(totalCells, Allocator.Persistent);
            }

            var obstaclePositions = MovingObstacleSystem.GlobalObstaclePositions;
            var obstacleRadii = MovingObstacleSystem.GlobalObstacleRadii;

            if (!obstaclePositions.IsCreated || obstaclePositions.Length == 0)
            {
                GlobalLowResDirections = _directions;
                return;
            }

            int destCellX = (int)((lowResGridX - 1) / 2f);
            int destCellZ = (int)((lowResGridZ - 1) / 2f);
            int destCellIndex = destCellZ * lowResGridX + destCellX;

            var generateJob = new GenerateLowResIntegrationFieldJob
            {
                GridSizeX = lowResGridX,
                GridSizeZ = lowResGridZ,
                CellSize = lowResCellSize,
                Origin = config.Origin,
                DestinationCellIndex = destCellIndex,
                ObstaclePositions = obstaclePositions,
                ObstacleRadii = obstacleRadii,
                Costs = _costs,
                IntegrationCosts = _integrationCosts,
                Blocked = _blocked
            };

            var generateHandle = generateJob.Schedule(totalCells, 64);
            generateHandle.Complete();

            var dijkstraJob = new LowResDijkstraJob
            {
                GridSizeX = lowResGridX,
                GridSizeZ = lowResGridZ,
                DestinationCellIndex = destCellIndex,
                IntegrationCosts = _integrationCosts,
                Costs = _costs,
                Blocked = _blocked
            };

            var dijkstraHandle = dijkstraJob.Schedule();
            dijkstraHandle.Complete();

            var dirJob = new CalculateLowResFlowFieldDirectionsJob
            {
                GridSizeX = lowResGridX,
                GridSizeZ = lowResGridZ,
                IntegrationCosts = _integrationCosts,
                Blocked = _blocked,
                Directions = _directions
            };

            var dirHandle = dirJob.Schedule(totalCells, 64);
            dirHandle.Complete();

            GlobalLowResDirections = _directions;

            _stopwatch.Stop();

            var stats = SystemAPI.GetSingleton<PerformanceStats>();
            stats.LowResPathfindingTime = (float)_stopwatch.Elapsed.TotalMilliseconds;
            SystemAPI.SetSingleton(stats);
        }
    }

    [UpdateInGroup(typeof(FlowFieldSimulationGroup)), UpdateAfter(typeof(LowResFlowFieldSystem)), UpdateBefore(typeof(UnitMovementSystem))]
    public partial struct LODUpdateSystem : ISystem
    {
        private NativeArray<float3> _positions;
        private NativeArray<byte> _lodLevels;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<LODReference>();
        }

        public void OnDestroy(ref SystemState state)
        {
            if (_positions.IsCreated) _positions.Dispose();
            if (_lodLevels.IsCreated) _lodLevels.Dispose();
        }

        public void OnUpdate(ref SystemState state)
        {
            var lodRef = SystemAPI.GetSingleton<LODReference>();

            int unitCount = 0;
            foreach (var (transform, lod) in
                SystemAPI.Query<RefRO<LocalTransform>, RefRW<UnitLOD>>())
            {
                unitCount++;
            }

            if (unitCount == 0) return;

            EnsureArrays(unitCount);

            int index = 0;
            int highResCount = 0;
            int lowResCount = 0;

            foreach (var (transform, lod) in
                SystemAPI.Query<RefRO<LocalTransform>, RefRW<UnitLOD>>())
            {
                float dist = math.distance(transform.ValueRO.Position, lodRef.Position);
                byte newLevel = dist > lodRef.HighResDistance ? (byte)1 : (byte)0;

                lod.ValueRW.Level = newLevel;
                _positions[index] = transform.ValueRO.Position;
                _lodLevels[index] = newLevel;

                if (newLevel == 0) highResCount++;
                else lowResCount++;

                index++;
            }

            var stats = SystemAPI.GetSingleton<PerformanceStats>();
            stats.HighResUnitCount = highResCount;
            stats.LowResUnitCount = lowResCount;
            SystemAPI.SetSingleton(stats);
        }

        private void EnsureArrays(int count)
        {
            if (!_positions.IsCreated || _positions.Length != count)
            {
                if (_positions.IsCreated) _positions.Dispose();
                _positions = new NativeArray<float3>(count, Allocator.Persistent);
            }
            if (!_lodLevels.IsCreated || _lodLevels.Length != count)
            {
                if (_lodLevels.IsCreated) _lodLevels.Dispose();
                _lodLevels = new NativeArray<byte>(count, Allocator.Persistent);
            }
        }
    }
}
