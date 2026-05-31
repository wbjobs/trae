using Unity.Entities;
using Unity.Mathematics;

namespace FlowField
{
    [UpdateInGroup(typeof(FlowFieldSimulationGroup)), UpdateAfter(typeof(UnitMovementSystem)), UpdateBefore(typeof(DisplaySystem))]
    public partial struct PerformanceStatsSystem : ISystem
    {
        private float _fpsAccumulator;
        private int _fpsFrameCount;
        private float _fpsUpdateInterval;
        private float _timeSinceLastFpsUpdate;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<PerformanceStats>();
            _fpsAccumulator = 0;
            _fpsFrameCount = 0;
            _fpsUpdateInterval = 0.5f;
            _timeSinceLastFpsUpdate = 0;
        }

        public void OnDestroy(ref SystemState state)
        {
        }

        public void OnUpdate(ref SystemState state)
        {
            float deltaTime = SystemAPI.Time.DeltaTime;

            _fpsAccumulator += deltaTime;
            _fpsFrameCount++;
            _timeSinceLastFpsUpdate += deltaTime;

            var stats = SystemAPI.GetSingleton<PerformanceStats>();

            stats.DeltaTime = deltaTime;
            stats.FrameCount++;

            if (_timeSinceLastFpsUpdate >= _fpsUpdateInterval)
            {
                stats.FPS = _fpsFrameCount / _fpsAccumulator;
                _fpsAccumulator = 0;
                _fpsFrameCount = 0;
                _timeSinceLastFpsUpdate = 0;
            }

            SystemAPI.SetSingleton(stats);
        }
    }
}
