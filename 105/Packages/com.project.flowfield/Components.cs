using Unity.Entities;
using Unity.Mathematics;

namespace FlowField
{
    public struct Unit : IComponentData
    {
        public float3 Velocity;
        public float3 CurrentDirection;
    }

    public struct Target : IComponentData
    {
        public float3 Destination;
        public bool HasReachedDestination;
    }

    public struct Speed : IComponentData
    {
        public float Value;
    }

    public struct Radius : IComponentData
    {
        public float Value;
    }

    public struct Obstacle : IComponentData
    {
        public float3 Position;
        public float Radius;
    }

    public struct MovingObstacle : IComponentData
    {
        public float3 Velocity;
        public float3 Origin;
        public float MovementRange;
        public float Phase;
    }

    public struct GridConfig : IComponentData
    {
        public int GridSizeX;
        public int GridSizeZ;
        public float CellSize;
        public float3 Origin;
    }

    public struct LowResGridConfig : IComponentData
    {
        public int GridSizeX;
        public int GridSizeZ;
        public float CellSize;
        public float3 Origin;
    }

    public struct FlowFieldData : IBufferElementData
    {
        public float2 Direction;
        public byte Cost;
    }

    public struct UnitLOD : IComponentData
    {
        public byte Level;
    }

    public struct LODReference : IComponentData
    {
        public float3 Position;
        public float HighResDistance;
    }

    public struct PerformanceStats : IComponentData
    {
        public float FPS;
        public float AverageSpeed;
        public float PathfindingTime;
        public float LowResPathfindingTime;
        public int HighResUnitCount;
        public int LowResUnitCount;
        public int FrameCount;
        public float DeltaTime;
    }
}
