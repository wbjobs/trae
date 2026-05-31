use bevy::prelude::*;
use bevy_rapier2d::prelude::*;
use std::collections::HashMap;

const PARTICLE_MASS: f32 = 0.1;
const SPRING_STIFFNESS: f32 = 120.0;
const SPRING_DAMPING: f32 = 5.0;
const MOVE_FORCE: f32 = 10.0;
const PARTICLE_RADIUS: f32 = 0.12;
const GRID_COLS: usize = 5;
const GRID_ROWS: usize = 8;
const SPACING: f32 = 0.3;
const STRESS_THRESHOLD: f32 = 0.3;

const MUSCLE_CONTRACTION_RATIO: f32 = 0.25;
const MUSCLE_CYCLE_PERIOD: f32 = 0.8;
const MUSCLE_STIFFNESS_MULTIPLIER: f32 = 2.0;

const COLLISION_GROUP_PARTICLES: Group = Group::GROUP_1;
const COLLISION_GROUP_TERRAIN: Group = Group::GROUP_2;

#[derive(Component)]
struct Particle {
    index: usize,
    row: usize,
    col: usize,
}

#[derive(Component)]
struct Spring {
    base_rest_length: f32,
    current_rest_length: f32,
    stress: f32,
    particle_a: usize,
    particle_b: usize,
    spring_type: SpringType,
}

#[derive(Clone, Copy, PartialEq)]
enum SpringType {
    Structural,
    MuscleHorizontal,
    MuscleVertical,
    MuscleDiagonal,
}

#[derive(Resource)]
struct BugParticles {
    entities: Vec<Entity>,
}

#[derive(Resource)]
struct BugController {
    target_direction: Vec2,
}

#[derive(Resource)]
struct MuscleController {
    time: f32,
    cycle_phase: f32,
}

fn main() {
    App::new()
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                title: "软体动物模拟 - Mollusk Simulation (Muscle Control)".into(),
                resolution: (1200.0, 800.0).into(),
                ..default()
            }),
            ..default()
        }))
        .add_plugins(RapierPhysicsPlugin::<NoUserData>::pixels_per_meter(100.0).with_physics_scale(100.0))
        .add_plugins(RapierDebugRenderPlugin {
            enabled: false,
            ..default()
        })
        .insert_resource(BugController {
            target_direction: Vec2::X,
        })
        .insert_resource(BugParticles {
            entities: Vec::new(),
        })
        .insert_resource(MuscleController {
            time: 0.0,
            cycle_phase: 0.0,
        })
        .insert_resource(RapierConfiguration {
            gravity: Vec2::new(0.0, -9.81 * 100.0),
            timestep_mode: TimestepMode::Fixed {
                dt: 1.0 / 120.0,
                substeps: 4,
            },
            ..default()
        })
        .add_systems(Startup, (setup_camera, setup_environment, setup_bug))
        .add_systems(
            Update,
            (
                clear_forces_system,
                muscle_update_system,
                spring_force_system,
                spring_stress_visualization,
                user_input_system,
                movement_system,
                camera_follow_system,
            )
                .chain(),
        )
        .run();
}

fn setup_camera(mut commands: Commands) {
    commands.spawn(Camera2dBundle {
        transform: Transform::from_xyz(0.0, 100.0, 100.0),
        ..default()
    });
}

fn setup_environment(mut commands: Commands) {
    let ground_width = 60.0;
    let ground_thickness = 1.0;

    commands
        .spawn(Collider::cuboid(ground_width, ground_thickness))
        .insert(RigidBody::Fixed)
        .insert(CollisionGroups::new(COLLISION_GROUP_TERRAIN, Group::ALL))
        .insert(Friction::coefficient(0.8))
        .insert(Restitution::coefficient(0.0))
        .insert(TransformBundle::from(Transform::from_xyz(
            0.0,
            -ground_thickness * 100.0 / 2.0,
            0.0,
        )));

    for i in 0..4 {
        let x_pos = -20.0 + i as f32 * 13.0;
        let radius = 0.8 + (i % 2) as f32 * 0.4;
        commands
            .spawn(Collider::ball(radius))
            .insert(RigidBody::Fixed)
            .insert(CollisionGroups::new(COLLISION_GROUP_TERRAIN, Group::ALL))
            .insert(Friction::coefficient(0.8))
            .insert(Restitution::coefficient(0.0))
            .insert(TransformBundle::from(Transform::from_xyz(
                x_pos * 100.0,
                0.0,
                0.0,
            )));
    }

    for i in 0..3 {
        let x_pos = 10.0 + i as f32 * 8.0;
        let width = 1.5 + i as f32 * 0.3;
        let height = 0.4;
        commands
            .spawn(Collider::cuboid(width, height))
            .insert(RigidBody::Fixed)
            .insert(CollisionGroups::new(COLLISION_GROUP_TERRAIN, Group::ALL))
            .insert(Friction::coefficient(0.8))
            .insert(Restitution::coefficient(0.0))
            .insert(TransformBundle::from(Transform::from_xyz(
                x_pos * 100.0,
                height * 100.0,
                0.0,
            )));
    }
}

fn setup_bug(mut commands: Commands, mut bug_particles: ResMut<BugParticles>) {
    let start_x = -((GRID_COLS as f32 - 1.0) * SPACING) / 2.0;
    let start_y = 1.5 + ((GRID_ROWS as f32 * SPACING) / 2.0);

    let mut entities = Vec::new();

    for row in 0..GRID_ROWS {
        for col in 0..GRID_COLS {
            let x = start_x + col as f32 * SPACING;
            let y = start_y - row as f32 * SPACING;
            let idx = row * GRID_COLS + col;

            let entity = commands
                .spawn(RigidBody::Dynamic)
                .insert(Collider::ball(PARTICLE_RADIUS))
                .insert(Particle { index: idx, row, col })
                .insert(TransformBundle::from(Transform::from_xyz(
                    x * 100.0,
                    y * 100.0,
                    0.0,
                )))
                .insert(ExternalForce::default())
                .insert(Velocity::default())
                .insert(GravityScale(1.0))
                .insert(ColliderMassProperties::Mass(PARTICLE_MASS))
                .insert(Damping {
                    linear_damping: 0.5,
                    angular_damping: 0.5,
                })
                .insert(Ccd::enabled())
                .insert(CollisionGroups::new(
                    COLLISION_GROUP_PARTICLES,
                    COLLISION_GROUP_TERRAIN,
                ))
                .insert(Friction::coefficient(0.5))
                .insert(Restitution::coefficient(0.0))
                .insert(SolverGroups::new(
                    COLLISION_GROUP_PARTICLES,
                    COLLISION_GROUP_TERRAIN,
                ))
                .with_children(|parent| {
                    parent.spawn(SpriteBundle {
                        sprite: Sprite {
                            color: Color::rgb(0.3, 0.6, 0.9),
                            custom_size: Some(Vec2::new(
                                PARTICLE_RADIUS * 200.0,
                                PARTICLE_RADIUS * 200.0,
                            )),
                            ..default()
                        },
                        transform: Transform::from_xyz(0.0, 0.0, 0.0),
                        ..default()
                    });
                })
                .id();

            entities.push(entity);
        }
    }

    bug_particles.entities = entities.clone();

    let mut spring_count = 0;

    for row in 0..GRID_ROWS {
        for col in 0..GRID_COLS {
            let idx = row * GRID_COLS + col;

            if col + 1 < GRID_COLS && spring_count < 60 {
                let right_idx = row * GRID_COLS + col + 1;
                let spring_type = if row >= GRID_ROWS - 3 {
                    SpringType::MuscleHorizontal
                } else {
                    SpringType::Structural
                };
                spawn_spring(&mut commands, idx, right_idx, SPACING, spring_type, &mut spring_count);
            }

            if row + 1 < GRID_ROWS && spring_count < 60 {
                let down_idx = (row + 1) * GRID_COLS + col;
                let spring_type = if col == 0 || col == GRID_COLS - 1 {
                    SpringType::MuscleVertical
                } else {
                    SpringType::Structural
                };
                spawn_spring(&mut commands, idx, down_idx, SPACING, spring_type, &mut spring_count);
            }

            if col + 1 < GRID_COLS && row + 1 < GRID_ROWS && spring_count < 60 {
                let diag_idx = (row + 1) * GRID_COLS + col + 1;
                let spring_type = if row >= GRID_ROWS - 2 {
                    SpringType::MuscleDiagonal
                } else {
                    SpringType::Structural
                };
                spawn_spring(
                    &mut commands,
                    idx,
                    diag_idx,
                    SPACING * std::f32::consts::SQRT_2,
                    spring_type,
                    &mut spring_count,
                );
            }

            if col > 0 && row + 1 < GRID_ROWS && spring_count < 60 {
                let diag_idx = (row + 1) * GRID_COLS + col - 1;
                let spring_type = if row >= GRID_ROWS - 2 {
                    SpringType::MuscleDiagonal
                } else {
                    SpringType::Structural
                };
                spawn_spring(
                    &mut commands,
                    idx,
                    diag_idx,
                    SPACING * std::f32::consts::SQRT_2,
                    spring_type,
                    &mut spring_count,
                );
            }
        }
    }

    info!(
        "软体动物初始化完成: {} 个质点, {} 根弹簧",
        entities.len(),
        spring_count
    );
}

fn spawn_spring(
    commands: &mut Commands,
    particle_a: usize,
    particle_b: usize,
    rest_length: f32,
    spring_type: SpringType,
    spring_count: &mut usize,
) {
    commands.spawn(Spring {
        base_rest_length: rest_length,
        current_rest_length: rest_length,
        stress: 0.0,
        particle_a,
        particle_b,
        spring_type,
    });
    *spring_count += 1;
}

fn clear_forces_system(mut force_query: Query<&mut ExternalForce>) {
    for mut ext_force in force_query.iter_mut() {
        ext_force.force = Vec3::ZERO;
        ext_force.torque = 0.0;
    }
}

fn muscle_update_system(
    time: Res<Time>,
    controller: Res<BugController>,
    mut muscle_controller: ResMut<MuscleController>,
    mut spring_query: Query<&mut Spring>,
) {
    muscle_controller.time += time.delta_seconds();

    let direction_sign = controller.target_direction.x.signum();
    if direction_sign == 0.0 {
        return;
    }

    for mut spring in spring_query.iter_mut() {
        if spring.spring_type == SpringType::Structural {
            spring.current_rest_length = spring.base_rest_length;
            continue;
        }

        let contraction = compute_muscle_contraction(
            muscle_controller.time,
            spring.spring_type,
            direction_sign,
        );

        spring.current_rest_length = spring.base_rest_length * (1.0 - contraction);
    }
}

fn compute_muscle_contraction(
    time: f32,
    spring_type: SpringType,
    direction_sign: f32,
) -> f32 {
    let phase = (time % MUSCLE_CYCLE_PERIOD) / MUSCLE_CYCLE_PERIOD;
    let angle = phase * std::f32::consts::TAU;

    match spring_type {
        SpringType::MuscleHorizontal => {
            let wave = (angle).sin() * 0.5 + 0.5;
            wave * MUSCLE_CONTRACTION_RATIO
        }
        SpringType::MuscleVertical => {
            let phase_offset = if direction_sign > 0.0 { 0.5 } else { -0.5 };
            let adjusted_angle = angle + phase_offset * std::f32::consts::TAU;
            let wave = (adjusted_angle).sin() * 0.5 + 0.5;
            wave * MUSCLE_CONTRACTION_RATIO * 0.5
        }
        SpringType::MuscleDiagonal => {
            let phase_offset = if direction_sign > 0.0 { 0.25 } else { -0.25 };
            let adjusted_angle = angle + phase_offset * std::f32::consts::TAU;
            let wave = (adjusted_angle).sin() * 0.5 + 0.5;
            wave * MUSCLE_CONTRACTION_RATIO * 0.7
        }
        SpringType::Structural => 0.0,
    }
}

fn spring_force_system(
    mut spring_query: Query<&mut Spring>,
    particle_query: Query<(&Particle, &Transform, &Velocity)>,
    mut force_query: Query<&mut ExternalForce>,
    bug_particles: Res<BugParticles>,
) {
    let entity_map: HashMap<usize, Entity> = bug_particles
        .entities
        .iter()
        .enumerate()
        .map(|(i, e)| (i, *e))
        .collect();

    for mut spring in spring_query.iter_mut() {
        let entity_a = entity_map.get(&spring.particle_a).copied();
        let entity_b = entity_map.get(&spring.particle_b).copied();

        if let (Some(ea), Some(eb)) = (entity_a, entity_b) {
            let (_, transform_a, velocity_a) = particle_query.get(ea).unwrap();
            let (_, transform_b, velocity_b) = particle_query.get(eb).unwrap();

            let pos_a = Vec2::new(
                transform_a.translation.x / 100.0,
                transform_a.translation.y / 100.0,
            );
            let pos_b = Vec2::new(
                transform_b.translation.x / 100.0,
                transform_b.translation.y / 100.0,
            );

            let diff = pos_b - pos_a;
            let distance = diff.length();

            if distance > 0.0001 {
                let direction = diff / distance;
                let extension = distance - spring.current_rest_length;

                spring.stress = (extension / spring.current_rest_length).abs();

                let vel_a = Vec2::new(
                    velocity_a.linvel.x / 100.0,
                    velocity_a.linvel.y / 100.0,
                );
                let vel_b = Vec2::new(
                    velocity_b.linvel.x / 100.0,
                    velocity_b.linvel.y / 100.0,
                );

                let rel_vel = vel_b - vel_a;
                let rel_vel_along = rel_vel.dot(direction);

                let stiffness = if spring.spring_type != SpringType::Structural {
                    SPRING_STIFFNESS * MUSCLE_STIFFNESS_MULTIPLIER
                } else {
                    SPRING_STIFFNESS
                };

                let force_magnitude =
                    stiffness * extension + SPRING_DAMPING * rel_vel_along;
                let force = direction * force_magnitude;

                if let Ok(mut ext_force) = force_query.get_mut(ea) {
                    ext_force.force += Vec3::new(force.x * 100.0, force.y * 100.0, 0.0);
                }

                if let Ok(mut ext_force) = force_query.get_mut(eb) {
                    ext_force.force -= Vec3::new(force.x * 100.0, force.y * 100.0, 0.0);
                }
            }
        }
    }
}

fn spring_stress_visualization(
    mut gizmos: Gizmos,
    spring_query: Query<&Spring>,
    particle_query: Query<(&Particle, &Transform)>,
    bug_particles: Res<BugParticles>,
) {
    let entity_map: HashMap<usize, Entity> = bug_particles
        .entities
        .iter()
        .enumerate()
        .map(|(i, e)| (i, *e))
        .collect();

    for spring in spring_query.iter() {
        let entity_a = entity_map.get(&spring.particle_a).copied();
        let entity_b = entity_map.get(&spring.particle_b).copied();

        if let (Some(ea), Some(eb)) = (entity_a, entity_b) {
            let (_, transform_a) = particle_query.get(ea).unwrap();
            let (_, transform_b) = particle_query.get(eb).unwrap();

            let pos_a = Vec2::new(transform_a.translation.x, transform_a.translation.y);
            let pos_b = Vec2::new(transform_b.translation.x, transform_b.translation.y);

            let stress_ratio = (spring.stress / STRESS_THRESHOLD).min(1.0);
            let is_muscle = spring.spring_type != SpringType::Structural;

            let color = if is_muscle {
                let contraction_ratio = 1.0 - spring.current_rest_length / spring.base_rest_length;
                Color::rgb(
                    stress_ratio,
                    1.0 - stress_ratio * 0.8,
                    1.0 - stress_ratio - contraction_ratio * 0.5,
                )
            } else {
                Color::rgb(
                    stress_ratio,
                    1.0 - stress_ratio * 0.8,
                    1.0 - stress_ratio,
                )
            };

            gizmos.line_2d(pos_a, pos_b, color);
        }
    }
}

fn user_input_system(
    keyboard_input: Res<Input<KeyCode>>,
    mut controller: ResMut<BugController>,
) {
    let mut dir = Vec2::ZERO;

    if keyboard_input.pressed(KeyCode::Left) || keyboard_input.pressed(KeyCode::A) {
        dir.x -= 1.0;
    }
    if keyboard_input.pressed(KeyCode::Right) || keyboard_input.pressed(KeyCode::D) {
        dir.x += 1.0;
    }
    if keyboard_input.pressed(KeyCode::Up) || keyboard_input.pressed(KeyCode::W) {
        dir.y += 1.0;
    }
    if keyboard_input.pressed(KeyCode::Down) || keyboard_input.pressed(KeyCode::S) {
        dir.y -= 1.0;
    }

    if dir.length() > 0.0 {
        controller.target_direction = dir.normalize();
    }
}

fn movement_system(
    controller: Res<BugController>,
    mut force_query: Query<(&Particle, &Transform, &mut ExternalForce)>,
) {
    let target = controller.target_direction;
    let force = target * MOVE_FORCE;

    for (_, transform, mut ext_force) in force_query.iter_mut() {
        let pos = transform.translation;

        if pos.y < 120.0 {
            let ground_factor = 1.0 - (pos.y / 120.0).max(0.0);
            ext_force.force.x += force.x * ground_factor * 100.0;
        }
    }
}

fn camera_follow_system(
    mut camera_query: Query<&mut Transform, With<Camera>>,
    particle_query: Query<&Transform, With<Particle>>,
) {
    if let Ok(mut camera_transform) = camera_query.single_mut() {
        let mut center = Vec2::ZERO;
        let mut count = 0.0;

        for transform in particle_query.iter() {
            center.x += transform.translation.x;
            center.y += transform.translation.y;
            count += 1.0;
        }

        if count > 0.0 {
            center /= count;
            camera_transform.translation.x = center.x;
            camera_transform.translation.y = center.y + 50.0;
        }
    }
}