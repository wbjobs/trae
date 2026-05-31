# Unity DOTS Flow Field Pathfinding

This is a Unity DOTS (ECS + Job System + Burst Compiler) project implementing flow field pathfinding for 100,000 units with dynamic obstacle avoidance.

## Features

- **100,000 Units**: Each unit moves from a random start position to a random destination
- **Flow Field Pathfinding**: Custom flow field implementation using integration field (Dijkstra's algorithm)
- **Dynamic Obstacles**: 20 moving obstacles that are avoided in real-time
- **Performance Stats**: Real-time display of FPS, average speed, and pathfinding time
- **ECS Architecture**: Uses Unity's Entity Component System for maximum performance
- **Burst Compiled Jobs**: All pathfinding and movement operations are Burst-compiled
- **Parallel Processing**: Uses IJobParallelFor for grid and unit processing

## Project Structure

```
Packages/com.project.flowfield/
├── Components.cs              # ECS component definitions
├── CoreSystems.cs             # Flow field generation, unit movement, obstacle systems
├── PerformanceStatsSystem.cs  # FPS and performance statistics
├── DisplaySystem.cs           # HUD display system
├── FlowFieldSceneSetup.cs     # Scene initialization MonoBehaviour
├── SceneInitializer.cs        # Alternative scene setup
├── Bootstrap.cs               # Bootstrap initialization
├── SystemGroups.cs            # System group definitions
└── SystemSetup.cs             # System setup utilities

Assets/Scenes/
└── Main.unity                 # Main scene with camera and setup object
```

## How to Use

1. Open the project in Unity (2022.3 LTS or later with Entities package)
2. Open `Assets/Scenes/Main.unity`
3. Select the **FlowFieldSetup** GameObject
4. Configure settings in Inspector:
   - Grid Size X/Z: Flow field resolution (default: 200x200)
   - Cell Size: Size of each grid cell (default: 1.0)
   - Unit Count: Number of units to simulate (default: 100,000)
   - Min/Max Speed: Unit speed range
   - Obstacle Count: Number of dynamic obstacles (default: 20)
5. Press Play

## Performance Display

The HUD shows:
- **FPS**: Current frames per second
- **Units**: Total unit count
- **Obstacles**: Total obstacle count
- **Avg Speed**: Average movement speed of all moving units
- **Pathfinding**: Time in milliseconds to generate flow field each frame
- **Delta Time**: Current frame delta time in milliseconds

## Technical Details

### Flow Field Algorithm

1. **Cost Field**: Each cell has a base cost (1 for empty, 255 for blocked)
2. **Integration Field**: Dijkstra's algorithm propagates costs from destination
3. **Flow Field**: Each cell stores the direction toward the lowest-cost neighbor

### Update Order

1. **MovingObstacleSystem**: Updates dynamic obstacle positions
2. **FlowFieldSystem**: Regenerates the flow field avoiding obstacles
3. **UnitMovementSystem**: Moves units along the flow field
4. **PerformanceStatsSystem**: Calculates FPS and statistics
5. **DisplaySystem**: Updates HUD display

### ECS Components

- `Unit`: Velocity and current direction
- `Target`: Destination position and arrival status
- `Speed`: Movement speed
- `Radius`: Unit radius for collision
- `Obstacle`: Position and radius
- `MovingObstacle`: Velocity, origin, movement range, phase
- `GridConfig`: Grid dimensions and cell size
- `PerformanceStats`: FPS, speed, pathfinding time

## Requirements

- Unity 2022.3 LTS or later
- Entities package 1.0+
- Burst package
- Collections package
- Mathematics package
- Jobs package

## Performance Tips

- Reduce grid size for better performance
- Reduce obstacle count for less pathfinding overhead
- Adjust unit count based on target hardware
- Use Burst compiler (enabled by default)
