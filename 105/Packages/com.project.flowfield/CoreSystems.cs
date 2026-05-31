using System;
using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace FlowField
{
    [BurstCompile]
    public struct UpdateMovingObstaclesJob : IJobParallelFor
    {
        public float Time;
        public float DeltaTime;

        public NativeArray<float3> Positions;
        public NativeArray<float3> Velocities;
        [ReadOnly] public NativeArray<float3> Origins;
        [ReadOnly] public NativeArray<float> Ranges;
        [ReadOnly] public NativeArray<float> Phases;

        public void Execute(int index)
        {
            float phase = Phases[index];
            float range = Ranges[index];
            float3 origin = Origins[index];

            float3 newPos = origin + new float3(
                math.sin(Time * 0.5f + phase) * range,
                0,
                math.cos(Time * 0.3f + phase * 1.5f) * range
            );

            float3 velocity = (newPos - Positions[index]) / math.max(DeltaTime, 0.001f);

            Positions[index] = newPos;
            Velocities[index] = velocity;
        }
    }

    [BurstCompile]
    public struct GenerateIntegrationFieldJob : IJobParallelFor
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
            for (int i = 0; i < ObstaclePositions.Length; i++)
            {
                float dist = math.distance(cellPos, ObstaclePositions[i]);
                if (dist < ObstacleRadii[i] + CellSize * 0.5f)
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
    public struct DijkstraJob : IJob
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
    public struct CalculateFlowFieldDirectionsJob : IJobParallelFor
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
    public struct MoveHighResUnitsJob : IJobParallelFor
    {
        public float DeltaTime;
        public int GridSizeX;
        public int GridSizeZ;
        public float CellSize;
        public float3 Origin;
        public float SmoothFactor;
        public float ObstacleAvoidanceRadius;

        [ReadOnly] public NativeArray<float2> FlowDirections;
        [ReadOnly] public NativeArray<float3> ObstaclePositions;
        [ReadOnly] public NativeArray<float> ObstacleRadii;

        public NativeArray<float3> Positions;
        public NativeArray<float3> Velocities;
        [ReadOnly] public NativeArray<float> Speeds;
        public NativeArray<float3> Destinations;
        public NativeArray<bool> HasReached;
        public NativeArray<float3> PreviousPositions;
        public NativeArray<int> StuckFrames;

        public void Execute(int index)
        {
            if (HasReached[index]) return;

            float3 pos = Positions[index];
            float3 dest = Destinations[index];
            float3 prevPos = PreviousPositions[index];

            float3 toDest = dest - pos;
            float distToDest = math.length(toDest);

            if (distToDest < 1.0f)
            {
                HasReached[index] = true;
                Velocities[index] = float3.zero;
                PreviousPositions[index] = pos;
                return;
            }

            float3 directDir = math.normalize(toDest);
            float3 flowDir = SampleHighResFlowField(pos);
            float3 obstacleAvoid = ComputeObstacleAvoidance(pos, Velocities[index]);

            int stuckCount = StuckFrames[index];
            float movedDist = math.distance(pos, prevPos);
            float expectedMove = Speeds[index] * DeltaTime;

            if (movedDist < expectedMove * 0.1f && DeltaTime > 0.0001f)
            {
                stuckCount++;
            }
            else
            {
                stuckCount = 0;
            }

            StuckFrames[index] = stuckCount;

            float3 desiredDir;

            if (stuckCount > 60)
            {
                float randomAngle = (float)((index * 0.37f + stuckCount * 0.13f) % (Math.PI * 2));
                float3 wanderDir = new float3(math.cos(randomAngle), 0, math.sin(randomAngle));
                desiredDir = math.normalize(
                    directDir * 0.35f +
                    wanderDir * 0.35f +
                    obstacleAvoid * 0.3f
                );
            }
            else if (stuckCount > 30)
            {
                float randomAngle = (float)((index * 0.37f + stuckCount * 0.13f) % (Math.PI * 2));
                float3 wanderDir = new float3(math.cos(randomAngle), 0, math.sin(randomAngle));
                desiredDir = math.normalize(
                    flowDir * 0.3f +
                    directDir * 0.3f +
                    wanderDir * 0.1f +
                    obstacleAvoid * 0.3f
                );
            }
            else
            {
                desiredDir = math.normalize(
                    flowDir * 0.5f +
                    directDir * 0.2f +
                    obstacleAvoid * 0.3f
                );
            }

            float3 currentVel = Velocities[index];
            float3 desiredVel = desiredDir * Speeds[index];

            float lerpFactor = SmoothFactor;
            if (stuckCount > 30) lerpFactor = 0.4f;

            float3 smoothedVel = math.lerp(currentVel, desiredVel, lerpFactor);

            float3 newPos = pos + smoothedVel * DeltaTime;
            newPos.y = 0;

            newPos.x = math.clamp(newPos.x, Origin.x, Origin.x + GridSizeX * CellSize);
            newPos.z = math.clamp(newPos.z, Origin.z, Origin.z + GridSizeZ * CellSize);

            PreviousPositions[index] = pos;
            Positions[index] = newPos;
            Velocities[index] = smoothedVel;
        }

        private float3 SampleHighResFlowField(float3 pos)
        {
            float cellXf = (pos.x - Origin.x) / CellSize;
            float cellZf = (pos.z - Origin.z) / CellSize;

            int cellX = (int)math.floor(cellXf);
            int cellZ = (int)math.floor(cellZf);

            float fracX = cellXf - cellX;
            float fracZ = cellZf - cellZ;

            float2 totalDir = float2.zero;
            float totalWeight = 0;

            for (int dz = -1; dz <= 1; dz++)
            {
                for (int dx = -1; dx <= 1; dx++)
                {
                    int sampleX = cellX + dx;
                    int sampleZ = cellZ + dz;

                    if (sampleX < 0 || sampleX >= GridSizeX || sampleZ < 0 || sampleZ >= GridSizeZ)
                        continue;

                    int sampleIdx = sampleZ * GridSizeX + sampleX;
                    float2 dir = FlowDirections[sampleIdx];

                    float distX = (dx + 0.5f) - fracX;
                    float distZ = (dz + 0.5f) - fracZ;
                    float dist = math.sqrt(distX * distX + distZ * distZ);
                    float weight = 1.0f / (dist + 0.1f);

                    totalDir += dir * weight;
                    totalWeight += weight;
                }
            }

            if (totalWeight > 0.001f)
            {
                float2 avgDir = totalDir / totalWeight;
                float len = math.length(avgDir);
                if (len > 0.01f)
                    return new float3(avgDir.x / len, 0, avgDir.y / len);
            }

            return float3.zero;
        }

        private float3 ComputeObstacleAvoidance(float3 pos, float3 velocity)
        {
            float3 avoidForce = float3.zero;

            for (int i = 0; i < ObstaclePositions.Length; i++)
            {
                float3 toObstacle = pos - ObstaclePositions[i];
                float dist = math.length(toObstacle);
                float minDist = ObstacleRadii[i] + ObstacleAvoidanceRadius;

                if (dist < minDist && dist > 0.01f)
                {
                    float strength = (minDist - dist) / minDist;
                    strength = strength * strength;
                    avoidForce += math.normalize(toObstacle) * strength;
                }
            }

            float speed = math.length(velocity);
            if (speed > 0.1f)
            {
                float3 forward = velocity / speed;
                float3 aheadPos = pos + forward * ObstacleAvoidanceRadius * 1.5f;

                bool obstacleAhead = false;
                for (int i = 0; i < ObstaclePositions.Length; i++)
                {
                    float distAhead = math.distance(aheadPos, ObstaclePositions[i]);
                    if (distAhead < ObstacleRadii[i] + 1.0f)
                    {
                        obstacleAhead = true;
                        break;
                    }
                }

                if (obstacleAhead)
                {
                    float3 left = new float3(-forward.z, 0, forward.x);
                    float3 right = new float3(forward.z, 0, -forward.x);

                    float leftClear = float.MaxValue;
                    float rightClear = float.MaxValue;

                    for (int i = 0; i < ObstaclePositions.Length; i++)
                    {
                        float3 leftPos = pos + left * 2.0f;
                        float3 rightPos = pos + right * 2.0f;

                        float dl = math.distance(leftPos, ObstaclePositions[i]);
                        float dr = math.distance(rightPos, ObstaclePositions[i]);

                        if (dl < ObstacleRadii[i] + 1.0f) leftClear = math.min(leftClear, dl);
                        if (dr < ObstacleRadii[i] + 1.0f) rightClear = math.min(rightClear, dr);
                    }

                    if (leftClear > rightClear)
                    {
                        avoidForce += left * 0.6f;
                    }
                    else
                    {
                        avoidForce += right * 0.6f;
                    }
                }
            }

            float avoidLen = math.length(avoidForce);
            if (avoidLen > 1.0f) avoidForce /= avoidLen;

            return avoidForce;
        }
    }

    [BurstCompile]
    public struct MoveLowResUnitsJob : IJobParallelFor
    {
        public float DeltaTime;
        public int HighResGridSizeX;
        public int HighResGridSizeZ;
        public float HighResCellSize;
        public float3 Origin;
        public float SmoothFactor;
        public float ObstacleAvoidanceRadius;

        [ReadOnly] public NativeArray<float2> LowResFlowDirections;
        public int LowResGridSizeX;
        public int LowResGridSizeZ;
        public float LowResCellSize;

        [ReadOnly] public NativeArray<float3> ObstaclePositions;
        [ReadOnly] public NativeArray<float> ObstacleRadii;

        public NativeArray<float3> Positions;
        public NativeArray<float3> Velocities;
        [ReadOnly] public NativeArray<float> Speeds;
        public NativeArray<float3> Destinations;
        public NativeArray<bool> HasReached;
        public NativeArray<float3> PreviousPositions;
        public NativeArray<int> StuckFrames;

        public void Execute(int index)
        {
            if (HasReached[index]) return;

            float3 pos = Positions[index];
            float3 dest = Destinations[index];
            float3 prevPos = PreviousPositions[index];

            float3 toDest = dest - pos;
            float distToDest = math.length(toDest);

            if (distToDest < 1.0f)
            {
                HasReached[index] = true;
                Velocities[index] = float3.zero;
                PreviousPositions[index] = pos;
                return;
            }

            float3 directDir = math.normalize(toDest);
            float3 flowDir = SampleLowResFlowField(pos);
            float3 obstacleAvoid = ComputeLowResObstacleAvoidance(pos, Velocities[index]);

            int stuckCount = StuckFrames[index];
            float movedDist = math.distance(pos, prevPos);
            float expectedMove = Speeds[index] * DeltaTime;

            if (movedDist < expectedMove * 0.1f && DeltaTime > 0.0001f)
            {
                stuckCount++;
            }
            else
            {
                stuckCount = 0;
            }

            StuckFrames[index] = stuckCount;

            float3 desiredDir;

            if (stuckCount > 60)
            {
                float randomAngle = (float)((index * 0.37f + stuckCount * 0.13f) % (Math.PI * 2));
                float3 wanderDir = new float3(math.cos(randomAngle), 0, math.sin(randomAngle));
                desiredDir = math.normalize(
                    directDir * 0.4f +
                    wanderDir * 0.35f +
                    obstacleAvoid * 0.25f
                );
            }
            else if (stuckCount > 30)
            {
                float randomAngle = (float)((index * 0.37f + stuckCount * 0.13f) % (Math.PI * 2));
                float3 wanderDir = new float3(math.cos(randomAngle), 0, math.sin(randomAngle));
                desiredDir = math.normalize(
                    flowDir * 0.25f +
                    directDir * 0.35f +
                    wanderDir * 0.15f +
                    obstacleAvoid * 0.25f
                );
            }
            else
            {
                desiredDir = math.normalize(
                    flowDir * 0.35f +
                    directDir * 0.35f +
                    obstacleAvoid * 0.3f
                );
            }

            float3 currentVel = Velocities[index];
            float3 desiredVel = desiredDir * Speeds[index];

            float lerpFactor = SmoothFactor * 0.7f;
            if (stuckCount > 30) lerpFactor = 0.3f;

            float3 smoothedVel = math.lerp(currentVel, desiredVel, lerpFactor);

            float3 newPos = pos + smoothedVel * DeltaTime;
            newPos.y = 0;

            newPos.x = math.clamp(newPos.x, Origin.x, Origin.x + HighResGridSizeX * HighResCellSize);
            newPos.z = math.clamp(newPos.z, Origin.z, Origin.z + HighResGridSizeZ * HighResCellSize);

            PreviousPositions[index] = pos;
            Positions[index] = newPos;
            Velocities[index] = smoothedVel;
        }

        private float3 SampleLowResFlowField(float3 pos)
        {
            float cellXf = (pos.x - Origin.x) / LowResCellSize;
            float cellZf = (pos.z - Origin.z) / LowResCellSize;

            int cellX = (int)math.floor(cellXf);
            int cellZ = (int)math.floor(cellZf);

            cellX = math.clamp(cellX, 0, LowResGridSizeX - 1);
            cellZ = math.clamp(cellZ, 0, LowResGridSizeZ - 1);

            int cellIndex = cellZ * LowResGridSizeX + cellX;

            if (cellIndex >= 0 && cellIndex < LowResFlowDirections.Length)
            {
                float2 dir = LowResFlowDirections[cellIndex];
                if (math.length(dir) > 0.01f)
                {
                    return new float3(dir.x, 0, dir.y);
                }
            }

            return float3.zero;
        }

        private float3 ComputeLowResObstacleAvoidance(float3 pos, float3 velocity)
        {
            float3 avoidForce = float3.zero;
            float avoidRadius = ObstacleAvoidanceRadius * 1.5f;

            for (int i = 0; i < ObstaclePositions.Length; i++)
            {
                float3 toObstacle = pos - ObstaclePositions[i];
                float dist = math.length(toObstacle);
                float minDist = ObstacleRadii[i] + avoidRadius;

                if (dist < minDist && dist > 0.01f)
                {
                    float strength = (minDist - dist) / minDist;
                    strength = strength * strength;
                    avoidForce += math.normalize(toObstacle) * strength;
                }
            }

            float avoidLen = math.length(avoidForce);
            if (avoidLen > 1.0f) avoidForce /= avoidLen;

            return avoidForce;
        }
    }

    [UpdateInGroup(typeof(FlowFieldSimulationGroup)), UpdateBefore(typeof(FlowFieldSystem))]
    public partial struct MovingObstacleSystem : ISystem
    {
        private NativeArray<float3> _positions;
        private NativeArray<float3> _velocities;
        private NativeArray<float3> _origins;
        private NativeArray<float> _ranges;
        private NativeArray<float> _phases;

        public static NativeArray<float3> GlobalObstaclePositions;
        public static NativeArray<float> GlobalObstacleRadii;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<MovingObstacle>();
        }

        public void OnDestroy(ref SystemState state)
        {
            if (_positions.IsCreated) _positions.Dispose();
            if (_velocities.IsCreated) _velocities.Dispose();
            if (_origins.IsCreated) _origins.Dispose();
            if (_ranges.IsCreated) _ranges.Dispose();
            if (_phases.IsCreated) _phases.Dispose();
            if (GlobalObstaclePositions.IsCreated) GlobalObstaclePositions.Dispose();
            if (GlobalObstacleRadii.IsCreated) GlobalObstacleRadii.Dispose();
        }

        public void OnUpdate(ref SystemState state)
        {
            float time = (float)SystemAPI.Time.ElapsedTime;
            float deltaTime = SystemAPI.Time.DeltaTime;

            int obstacleCount = 0;
            foreach (var (obstacle, moving) in
                SystemAPI.Query<RefRW<Obstacle>, RefRO<MovingObstacle>>())
            {
                obstacleCount++;
            }

            if (obstacleCount == 0) return;

            EnsureArrays(obstacleCount);

            int index = 0;
            foreach (var (obstacle, moving) in
                SystemAPI.Query<RefRW<Obstacle>, RefRO<MovingObstacle>>())
            {
                _positions[index] = obstacle.ValueRO.Position;
                _velocities[index] = moving.ValueRO.Velocity;
                _origins[index] = moving.ValueRO.Origin;
                _ranges[index] = moving.ValueRO.MovementRange;
                _phases[index] = moving.ValueRO.Phase;
                index++;
            }

            var job = new UpdateMovingObstaclesJob
            {
                Time = time,
                DeltaTime = deltaTime,
                Positions = _positions,
                Velocities = _velocities,
                Origins = _origins,
                Ranges = _ranges,
                Phases = _phases
            };

            var handle = job.Schedule(obstacleCount, 32);
            handle.Complete();

            index = 0;
            foreach (var (obstacle, moving) in
                SystemAPI.Query<RefRW<Obstacle>, RefRW<MovingObstacle>>())
            {
                obstacle.ValueRW.Position = _positions[index];
                moving.ValueRW.Velocity = _velocities[index];
                index++;
            }

            if (!GlobalObstaclePositions.IsCreated || GlobalObstaclePositions.Length != obstacleCount)
            {
                if (GlobalObstaclePositions.IsCreated) GlobalObstaclePositions.Dispose();
                GlobalObstaclePositions = new NativeArray<float3>(obstacleCount, Allocator.Persistent);
            }
            if (!GlobalObstacleRadii.IsCreated || GlobalObstacleRadii.Length != obstacleCount)
            {
                if (GlobalObstacleRadii.IsCreated) GlobalObstacleRadii.Dispose();
                GlobalObstacleRadii = new NativeArray<float>(obstacleCount, Allocator.Persistent);
            }

            index = 0;
            foreach (var obstacle in SystemAPI.Query<RefRO<Obstacle>>())
            {
                GlobalObstaclePositions[index] = obstacle.ValueRO.Position;
                GlobalObstacleRadii[index] = obstacle.ValueRO.Radius;
                index++;
            }
        }

        private void EnsureArrays(int count)
        {
            if (!_positions.IsCreated || _positions.Length != count)
            {
                if (_positions.IsCreated) _positions.Dispose();
                _positions = new NativeArray<float3>(count, Allocator.Persistent);
            }
            if (!_velocities.IsCreated || _velocities.Length != count)
            {
                if (_velocities.IsCreated) _velocities.Dispose();
                _velocities = new NativeArray<float3>(count, Allocator.Persistent);
            }
            if (!_origins.IsCreated || _origins.Length != count)
            {
                if (_origins.IsCreated) _origins.Dispose();
                _origins = new NativeArray<float3>(count, Allocator.Persistent);
            }
            if (!_ranges.IsCreated || _ranges.Length != count)
            {
                if (_ranges.IsCreated) _ranges.Dispose();
                _ranges = new NativeArray<float>(count, Allocator.Persistent);
            }
            if (!_phases.IsCreated || _phases.Length != count)
            {
                if (_phases.IsCreated) _phases.Dispose();
                _phases = new NativeArray<float>(count, Allocator.Persistent);
            }
        }
    }

    [UpdateInGroup(typeof(FlowFieldSimulationGroup)), UpdateAfter(typeof(MovingObstacleSystem)), UpdateBefore(typeof(UnitMovementSystem))]
    public partial struct FlowFieldSystem : ISystem
    {
        private NativeArray<short> _costs;
        private NativeArray<short> _integrationCosts;
        private NativeArray<bool> _blocked;
        private NativeArray<float2> _directions;

        public static NativeArray<float2> GlobalDirections;
        public static int GridSizeX;
        public static int GridSizeZ;

        private System.Diagnostics.Stopwatch _stopwatch;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<GridConfig>();
            _stopwatch = new System.Diagnostics.Stopwatch();
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
            _stopwatch.Restart();

            var config = SystemAPI.GetSingleton<GridConfig>();
            int totalCells = config.GridSizeX * config.GridSizeZ;

            GridSizeX = config.GridSizeX;
            GridSizeZ = config.GridSizeZ;

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

            var obstacleQuery = SystemAPI.QueryBuilder().WithAll<Obstacle>().Build();
            var obstacleArray = obstacleQuery.ToComponentDataArray<Obstacle>(Allocator.TempJob);

            var obstaclePositions = new NativeArray<float3>(obstacleArray.Length, Allocator.TempJob);
            var obstacleRadii = new NativeArray<float>(obstacleArray.Length, Allocator.TempJob);

            for (int i = 0; i < obstacleArray.Length; i++)
            {
                obstaclePositions[i] = obstacleArray[i].Position;
                obstacleRadii[i] = obstacleArray[i].Radius;
            }

            int destCellX = (int)((config.GridSizeX - 1) / 2f);
            int destCellZ = (int)((config.GridSizeZ - 1) / 2f);
            int destCellIndex = destCellZ * config.GridSizeX + destCellX;

            var generateJob = new GenerateIntegrationFieldJob
            {
                GridSizeX = config.GridSizeX,
                GridSizeZ = config.GridSizeZ,
                CellSize = config.CellSize,
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

            var dijkstraJob = new DijkstraJob
            {
                GridSizeX = config.GridSizeX,
                GridSizeZ = config.GridSizeZ,
                DestinationCellIndex = destCellIndex,
                IntegrationCosts = _integrationCosts,
                Costs = _costs,
                Blocked = _blocked
            };

            var dijkstraHandle = dijkstraJob.Schedule();
            dijkstraHandle.Complete();

            var dirJob = new CalculateFlowFieldDirectionsJob
            {
                GridSizeX = config.GridSizeX,
                GridSizeZ = config.GridSizeZ,
                IntegrationCosts = _integrationCosts,
                Blocked = _blocked,
                Directions = _directions
            };

            var dirHandle = dirJob.Schedule(totalCells, 64);
            dirHandle.Complete();

            GlobalDirections = _directions;

            obstaclePositions.Dispose();
            obstacleRadii.Dispose();
            obstacleArray.Dispose();

            _stopwatch.Stop();

            var stats = SystemAPI.GetSingleton<PerformanceStats>();
            stats.PathfindingTime = (float)_stopwatch.Elapsed.TotalMilliseconds;
            SystemAPI.SetSingleton(stats);
        }
    }

    [UpdateInGroup(typeof(FlowFieldSimulationGroup)), UpdateAfter(typeof(FlowFieldSystem)), UpdateBefore(typeof(PerformanceStatsSystem))]
    public partial struct UnitMovementSystem : ISystem
    {
        private NativeArray<float3> _highResPositions;
        private NativeArray<float3> _highResVelocities;
        private NativeArray<float> _highResSpeeds;
        private NativeArray<float3> _highResDestinations;
        private NativeArray<bool> _highResHasReached;
        private NativeArray<float3> _highResPreviousPositions;
        private NativeArray<int> _highResStuckFrames;

        private NativeArray<float3> _lowResPositions;
        private NativeArray<float3> _lowResVelocities;
        private NativeArray<float> _lowResSpeeds;
        private NativeArray<float3> _lowResDestinations;
        private NativeArray<bool> _lowResHasReached;
        private NativeArray<float3> _lowResPreviousPositions;
        private NativeArray<int> _lowResStuckFrames;

        private NativeArray<Entity> _highResEntities;
        private NativeArray<Entity> _lowResEntities;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<GridConfig>();
        }

        public void OnDestroy(ref SystemState state)
        {
            DisposeHighResArrays();
            DisposeLowResArrays();
        }

        private void DisposeHighResArrays()
        {
            if (_highResPositions.IsCreated) _highResPositions.Dispose();
            if (_highResVelocities.IsCreated) _highResVelocities.Dispose();
            if (_highResSpeeds.IsCreated) _highResSpeeds.Dispose();
            if (_highResDestinations.IsCreated) _highResDestinations.Dispose();
            if (_highResHasReached.IsCreated) _highResHasReached.Dispose();
            if (_highResPreviousPositions.IsCreated) _highResPreviousPositions.Dispose();
            if (_highResStuckFrames.IsCreated) _highResStuckFrames.Dispose();
            if (_highResEntities.IsCreated) _highResEntities.Dispose();
        }

        private void DisposeLowResArrays()
        {
            if (_lowResPositions.IsCreated) _lowResPositions.Dispose();
            if (_lowResVelocities.IsCreated) _lowResVelocities.Dispose();
            if (_lowResSpeeds.IsCreated) _lowResSpeeds.Dispose();
            if (_lowResDestinations.IsCreated) _lowResDestinations.Dispose();
            if (_lowResHasReached.IsCreated) _lowResHasReached.Dispose();
            if (_lowResPreviousPositions.IsCreated) _lowResPreviousPositions.Dispose();
            if (_lowResStuckFrames.IsCreated) _lowResStuckFrames.Dispose();
            if (_lowResEntities.IsCreated) _lowResEntities.Dispose();
        }

        public void OnUpdate(ref SystemState state)
        {
            var config = SystemAPI.GetSingleton<GridConfig>();
            float deltaTime = SystemAPI.Time.DeltaTime;

            int highResCount = 0;
            int lowResCount = 0;

            foreach (var (transform, unit, target, speed, lod) in
                SystemAPI.Query<RefRW<LocalTransform>, RefRW<Unit>, RefRW<Target>, RefRO<Speed>, RefRO<UnitLOD>>())
            {
                if (lod.ValueRO.Level == 0) highResCount++;
                else lowResCount++;
            }

            EnsureHighResArrays(highResCount);
            EnsureLowResArrays(lowResCount);

            int highIdx = 0;
            int lowIdx = 0;

            foreach (var (entity, transform, unit, target, speed, lod) in
                SystemAPI.GetEntityQuery(
                    ComponentType.ReadWrite<LocalTransform>(),
                    ComponentType.ReadWrite<Unit>(),
                    ComponentType.ReadWrite<Target>(),
                    ComponentType.ReadOnly<Speed>(),
                    ComponentType.ReadOnly<UnitLOD>()
                ).ToEntityArray(Allocator.Temp))
            {
                var transformData = state.EntityManager.GetComponentData<LocalTransform>(entity);
                var unitData = state.EntityManager.GetComponentData<Unit>(entity);
                var targetData = state.EntityManager.GetComponentData<Target>(entity);
                var speedData = state.EntityManager.GetComponentData<Speed>(entity);
                var lodData = state.EntityManager.GetComponentData<UnitLOD>(entity);

                if (lodData.Level == 0)
                {
                    _highResEntities[highIdx] = entity;
                    _highResPositions[highIdx] = transformData.Position;
                    _highResVelocities[highIdx] = unitData.Velocity;
                    _highResSpeeds[highIdx] = speedData.Value;
                    _highResDestinations[highIdx] = targetData.Destination;
                    _highResHasReached[highIdx] = targetData.HasReachedDestination;
                    highIdx++;
                }
                else
                {
                    _lowResEntities[lowIdx] = entity;
                    _lowResPositions[lowIdx] = transformData.Position;
                    _lowResVelocities[lowIdx] = unitData.Velocity;
                    _lowResSpeeds[lowIdx] = speedData.Value;
                    _lowResDestinations[lowIdx] = targetData.Destination;
                    _lowResHasReached[lowIdx] = targetData.HasReachedDestination;
                    lowIdx++;
                }
            }

            if (highResCount > 0 && FlowFieldSystem.GlobalDirections.IsCreated)
            {
                var highResJob = new MoveHighResUnitsJob
                {
                    DeltaTime = deltaTime,
                    GridSizeX = config.GridSizeX,
                    GridSizeZ = config.GridSizeZ,
                    CellSize = config.CellSize,
                    Origin = config.Origin,
                    SmoothFactor = 0.15f,
                    ObstacleAvoidanceRadius = 3.0f,
                    FlowDirections = FlowFieldSystem.GlobalDirections,
                    ObstaclePositions = MovingObstacleSystem.GlobalObstaclePositions,
                    ObstacleRadii = MovingObstacleSystem.GlobalObstacleRadii,
                    Positions = _highResPositions,
                    Velocities = _highResVelocities,
                    Speeds = _highResSpeeds,
                    Destinations = _highResDestinations,
                    HasReached = _highResHasReached,
                    PreviousPositions = _highResPreviousPositions,
                    StuckFrames = _highResStuckFrames
                };

                var highResHandle = highResJob.Schedule(highResCount, 64);
                highResHandle.Complete();
            }

            if (lowResCount > 0 && LowResFlowFieldSystem.GlobalLowResDirections.IsCreated)
            {
                var lowResJob = new MoveLowResUnitsJob
                {
                    DeltaTime = deltaTime,
                    HighResGridSizeX = config.GridSizeX,
                    HighResGridSizeZ = config.GridSizeZ,
                    HighResCellSize = config.CellSize,
                    Origin = config.Origin,
                    SmoothFactor = 0.15f,
                    ObstacleAvoidanceRadius = 3.0f,
                    LowResFlowDirections = LowResFlowFieldSystem.GlobalLowResDirections,
                    LowResGridSizeX = LowResFlowFieldSystem.LowResGridSizeX,
                    LowResGridSizeZ = LowResFlowFieldSystem.LowResGridSizeZ,
                    LowResCellSize = LowResFlowFieldSystem.LowResCellSize,
                    ObstaclePositions = MovingObstacleSystem.GlobalObstaclePositions,
                    ObstacleRadii = MovingObstacleSystem.GlobalObstacleRadii,
                    Positions = _lowResPositions,
                    Velocities = _lowResVelocities,
                    Speeds = _lowResSpeeds,
                    Destinations = _lowResDestinations,
                    HasReached = _lowResHasReached,
                    PreviousPositions = _lowResPreviousPositions,
                    StuckFrames = _lowResStuckFrames
                };

                var lowResHandle = lowResJob.Schedule(lowResCount, 128);
                lowResHandle.Complete();
            }

            for (int i = 0; i < highResCount; i++)
            {
                var entity = _highResEntities[i];
                var transform = state.EntityManager.GetComponentData<LocalTransform>(entity);
                var unit = state.EntityManager.GetComponentData<Unit>(entity);
                var target = state.EntityManager.GetComponentData<Target>(entity);

                transform.Position = _highResPositions[i];
                unit.Velocity = _highResVelocities[i];
                target.HasReachedDestination = _highResHasReached[i];

                state.EntityManager.SetComponentData(entity, transform);
                state.EntityManager.SetComponentData(entity, unit);
                state.EntityManager.SetComponentData(entity, target);
            }

            for (int i = 0; i < lowResCount; i++)
            {
                var entity = _lowResEntities[i];
                var transform = state.EntityManager.GetComponentData<LocalTransform>(entity);
                var unit = state.EntityManager.GetComponentData<Unit>(entity);
                var target = state.EntityManager.GetComponentData<Target>(entity);

                transform.Position = _lowResPositions[i];
                unit.Velocity = _lowResVelocities[i];
                target.HasReachedDestination = _lowResHasReached[i];

                state.EntityManager.SetComponentData(entity, transform);
                state.EntityManager.SetComponentData(entity, unit);
                state.EntityManager.SetComponentData(entity, target);
            }

            float totalSpeed = 0;
            int movingCount = 0;
            for (int i = 0; i < _highResVelocities.Length; i++)
            {
                float s = math.length(_highResVelocities[i]);
                if (s > 0.01f) { totalSpeed += s; movingCount++; }
            }
            for (int i = 0; i < _lowResVelocities.Length; i++)
            {
                float s = math.length(_lowResVelocities[i]);
                if (s > 0.01f) { totalSpeed += s; movingCount++; }
            }

            var stats = SystemAPI.GetSingleton<PerformanceStats>();
            stats.AverageSpeed = movingCount > 0 ? totalSpeed / movingCount : 0;
            SystemAPI.SetSingleton(stats);
        }

        private void EnsureHighResArrays(int count)
        {
            if (_highResPositions.IsCreated && _highResPositions.Length != count) DisposeHighResArrays();

            if (!_highResPositions.IsCreated)
            {
                _highResPositions = new NativeArray<float3>(count, Allocator.Persistent);
                _highResVelocities = new NativeArray<float3>(count, Allocator.Persistent);
                _highResSpeeds = new NativeArray<float>(count, Allocator.Persistent);
                _highResDestinations = new NativeArray<float3>(count, Allocator.Persistent);
                _highResHasReached = new NativeArray<bool>(count, Allocator.Persistent);
                _highResPreviousPositions = new NativeArray<float3>(count, Allocator.Persistent);
                _highResStuckFrames = new NativeArray<int>(count, Allocator.Persistent);
                _highResEntities = new NativeArray<Entity>(count, Allocator.Persistent);
            }
        }

        private void EnsureLowResArrays(int count)
        {
            if (_lowResPositions.IsCreated && _lowResPositions.Length != count) DisposeLowResArrays();

            if (!_lowResPositions.IsCreated)
            {
                _lowResPositions = new NativeArray<float3>(count, Allocator.Persistent);
                _lowResVelocities = new NativeArray<float3>(count, Allocator.Persistent);
                _lowResSpeeds = new NativeArray<float>(count, Allocator.Persistent);
                _lowResDestinations = new NativeArray<float3>(count, Allocator.Persistent);
                _lowResHasReached = new NativeArray<bool>(count, Allocator.Persistent);
                _lowResPreviousPositions = new NativeArray<float3>(count, Allocator.Persistent);
                _lowResStuckFrames = new NativeArray<int>(count, Allocator.Persistent);
                _lowResEntities = new NativeArray<Entity>(count, Allocator.Persistent);
            }
        }
    }
}
