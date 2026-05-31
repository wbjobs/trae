using Unity.Entities;

namespace FlowField
{
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct FlowFieldSimulationGroup : ISystemGroup
    {
    }

    [UpdateInGroup(typeof(FlowFieldSimulationGroup), OrderFirst = true)]
    public partial struct UpdateObstaclesGroup : ISystemGroup
    {
    }

    [UpdateInGroup(typeof(FlowFieldSimulationGroup), OrderAfter = typeof(UpdateObstaclesGroup))]
    public partial struct GenerateFlowFieldGroup : ISystemGroup
    {
    }

    [UpdateInGroup(typeof(FlowFieldSimulationGroup), OrderAfter = typeof(GenerateFlowFieldGroup))]
    public partial struct MoveUnitsGroup : ISystemGroup
    {
    }

    [UpdateInGroup(typeof(FlowFieldSimulationGroup), OrderLast = true)]
    public partial struct UpdateStatsGroup : ISystemGroup
    {
    }
}
