mod grid;
mod environment;
mod simulation;
mod render;
mod ui;
mod evolution;

use bevy::prelude::*;
use bevy::render::camera::ScalingMode;

use grid::Grid;
use environment::*;
use simulation::*;
use render::RenderPlugin;
use ui::UIPlugin;
use evolution::*;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                title: "生态模拟器 - Ecosystem Simulator".into(),
                resolution: (1300.0, 900.0).into(),
                ..default()
            }),
            ..default()
        }))
        .add_plugins(RenderPlugin)
        .add_plugins(UIPlugin)
        .insert_resource(Grid::new())
        .insert_resource(EnvironmentConfig::default())
        .insert_resource(SimulationParams::default())
        .insert_resource(StatsHistory::new(300))
        .insert_resource(SimulationTime::default())
        .insert_resource(SimBuffers::default())
        .insert_resource(EvolutionConfig::default())
        .insert_resource(LineageCounter::default())
        .insert_resource(EvolutionStats::default())
        .insert_resource(NicheHistory::new(300))
        .add_systems(Startup, (setup_camera, initialize_grid).chain())
        .add_systems(Update, (
            simulate_environment,
            simulate_light_competition,
            simulate_plants,
            update_stats,
        ).chain())
        .run();
}

fn setup_camera(mut commands: Commands) {
    commands.spawn(Camera2dBundle {
        camera: Camera {
            clear_color: ClearColorConfig::Custom(Color::srgb(0.05, 0.05, 0.08)),
            ..default()
        },
        projection: OrthographicProjection {
            scaling_mode: ScalingMode::FixedVertical(900.0),
            ..default()
        },
        ..default()
    });
}
