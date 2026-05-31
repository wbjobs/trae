using Unity.Entities;
using UnityEngine;

namespace FlowField
{
    [UpdateInGroup(typeof(FlowFieldSimulationGroup)), UpdateAfter(typeof(PerformanceStatsSystem))]
    public partial struct DisplaySystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<PerformanceStats>();
        }

        public void OnDestroy(ref SystemState state)
        {
        }

        public void OnUpdate(ref SystemState state)
        {
        }
    }

    public class PerformanceHUD : MonoBehaviour
    {
        private PerformanceStats _stats;
        private bool _initialized;

        void Update()
        {
            if (!_initialized)
            {
                var world = World.DefaultGameObjectInjectionWorld;
                if (world != null && world.IsCreated)
                {
                    var entityManager = world.EntityManager;
                    var query = entityManager.CreateEntityQuery(typeof(PerformanceStats));
                    if (query.HasSingleton<PerformanceStats>())
                    {
                        _initialized = true;
                    }
                }
            }
        }

        void OnGUI()
        {
            if (!_initialized) return;

            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return;

            var entityManager = world.EntityManager;
            var query = entityManager.CreateEntityQuery(typeof(PerformanceStats));
            if (query.HasSingleton<PerformanceStats>())
            {
                _stats = query.GetSingleton<PerformanceStats>();
            }

            int unitCount = 0;
            var unitQuery = entityManager.CreateEntityQuery(ComponentType.ReadOnly<Unit>());
            unitCount = unitQuery.CalculateEntityCount();

            int obstacleCount = 0;
            var obstacleQuery = entityManager.CreateEntityQuery(ComponentType.ReadOnly<Obstacle>());
            obstacleCount = obstacleQuery.CalculateEntityCount();

            GUI.skin.label.fontSize = 14;
            GUI.skin.box.fontSize = 12;

            GUILayout.BeginArea(new Rect(10, 10, 340, 280), GUI.skin.box);

            GUILayout.Label("=== Flow Field DOTS (LOD) ===", GUILayout.Width(320));
            GUILayout.Space(3);

            GUI.color = Color.green;
            GUILayout.Label($"FPS: {_stats.FPS:F1}", GUILayout.Width(320));
            GUI.color = Color.white;

            GUILayout.Space(2);
            GUILayout.Label($"Units: {unitCount:N0} (Hi-Res: {_stats.HighResUnitCount:N0} / Lo-Res: {_stats.LowResUnitCount:N0})", GUILayout.Width(320));
            GUILayout.Label($"Obstacles: {obstacleCount}", GUILayout.Width(320));

            GUILayout.Space(2);
            GUI.color = Color.cyan;
            GUILayout.Label($"Avg Speed: {_stats.AverageSpeed:F2}", GUILayout.Width(320));
            GUI.color = Color.white;

            GUILayout.Space(2);
            GUI.color = Color.yellow;
            GUILayout.Label($"Hi-Res Pathfinding: {_stats.PathfindingTime:F2}ms", GUILayout.Width(320));
            GUI.color = Color.white;

            GUI.color = new Color(1f, 0.6f, 0f);
            GUILayout.Label($"Lo-Res Pathfinding: {_stats.LowResPathfindingTime:F2}ms", GUILayout.Width(320));
            GUI.color = Color.white;

            float totalTime = _stats.PathfindingTime + _stats.LowResPathfindingTime;
            GUILayout.Label($"Total Pathfinding: {totalTime:F2}ms", GUILayout.Width(320));

            GUILayout.Space(2);
            GUILayout.Label($"Delta Time: {_stats.DeltaTime * 1000:F2}ms", GUILayout.Width(320));

            GUILayout.EndArea();
        }
    }
}
