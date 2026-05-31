using Unity.Entities;

namespace FlowField
{
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(MovingObstacleSystem))]
    public partial struct FlowFieldUpdateGroup : ISystemGroup
    {
    }

    public static class SystemSetup
    {
        public static void InitializeSystems(World world)
        {
            var simulationGroup = world.GetOrCreateSystem<SimulationSystemGroup>();

            simulationGroup.AddSystemToUpdateList(world.GetOrCreateSystem<MovingObstacleSystem>());
            simulationGroup.AddSystemToUpdateList(world.GetOrCreateSystem<FlowFieldSystem>());
            simulationGroup.AddSystemToUpdateList(world.GetOrCreateSystem<UnitMovementSystem>());
            simulationGroup.AddSystemToUpdateList(world.GetOrCreateSystem<PerformanceStatsSystem>());
            simulationGroup.AddSystemToUpdateList(world.GetOrCreateSystem<DisplaySystem>());
        }
    }
}
