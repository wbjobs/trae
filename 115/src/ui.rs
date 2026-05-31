use bevy::prelude::*;

use crate::environment::*;
use crate::evolution::*;
use crate::grid::*;

pub struct UIPlugin;

impl Plugin for UIPlugin {
    fn build(&self, app: &mut App) {
        app.add_event::<ResetEvent>()
            .add_systems(Startup, setup_ui)
            .add_systems(Update, (update_stats_text, draw_curves, draw_niche_plot, handle_input, handle_reset));
    }
}

#[derive(Event)]
pub struct ResetEvent;

#[derive(Component)]
struct StatsText;

#[derive(Component)]
struct TimeText;

#[derive(Component)]
struct EvoText;

#[derive(Component)]
struct CurveCanvas;

#[derive(Component)]
struct NicheCanvas;

const CANVAS_WIDTH: f32 = 400.0;
const CANVAS_HEIGHT: f32 = 200.0;
const NICHE_WIDTH: f32 = 350.0;
const NICHE_HEIGHT: f32 = 350.0;

fn setup_ui(mut commands: Commands) {
    let text_style = TextStyle {
        font_size: 14.0,
        color: Color::srgb(0.9, 0.9, 0.9),
        ..default()
    };

    commands.spawn((
        TextBundle::from_sections([
            TextSection::new("=== 生态模拟器 ===\n", TextStyle {
                font_size: 18.0,
                color: Color::srgb(0.4, 0.9, 0.4),
                ..default()
            }),
            TextSection::new("", text_style.clone()),
        ])
        .with_style(Style {
            position_type: PositionType::Absolute,
            top: Val::Px(10.0),
            left: Val::Px(10.0),
            ..default()
        }),
        StatsText,
    ));

    commands.spawn((
        TextBundle::from_sections([
            TextSection::new("", TextStyle {
                font_size: 12.0,
                color: Color::srgb(0.7, 0.7, 0.7),
                ..default()
            }),
        ])
        .with_style(Style {
            position_type: PositionType::Absolute,
            top: Val::Px(10.0),
            right: Val::Px(10.0),
            ..default()
        }),
        TimeText,
    ));

    commands.spawn((
        TextBundle::from_sections([
            TextSection::new("\n--- 进化统计 ---\n", TextStyle {
                font_size: 14.0,
                color: Color::srgb(0.6, 0.8, 1.0),
                ..default()
            }),
            TextSection::new("", text_style.clone()),
        ])
        .with_style(Style {
            position_type: PositionType::Absolute,
            top: Val::Px(180.0),
            left: Val::Px(10.0),
            ..default()
        }),
        EvoText,
    ));

    commands.spawn((
        NodeBundle {
            style: Style {
                position_type: PositionType::Absolute,
                top: Val::Px(200.0),
                right: Val::Px(10.0),
                width: Val::Px(CANVAS_WIDTH),
                height: Val::Px(CANVAS_HEIGHT),
                border: UiRect::all(Val::Px(1.0)),
                ..default()
            },
            background_color: Color::srgb(0.1, 0.1, 0.15).into(),
            border_color: Color::srgb(0.3, 0.3, 0.3).into(),
            ..default()
        },
        CurveCanvas,
    ));

    commands.spawn((
        NodeBundle {
            style: Style {
                position_type: PositionType::Absolute,
                bottom: Val::Px(10.0),
                right: Val::Px(10.0),
                width: Val::Px(NICHE_WIDTH),
                height: Val::Px(NICHE_HEIGHT),
                border: UiRect::all(Val::Px(1.0)),
                ..default()
            },
            background_color: Color::srgb(0.08, 0.08, 0.12).into(),
            border_color: Color::srgb(0.3, 0.3, 0.3).into(),
            ..default()
        },
        NicheCanvas,
    ));
}

fn update_stats_text(
    grid: Res<crate::grid::Grid>,
    history: Res<StatsHistory>,
    time: Res<SimulationTime>,
    evo_stats: Res<EvolutionStats>,
    mut query: Query<&mut Text, With<StatsText>>,
    mut time_query: Query<&mut Text, With<TimeText>>,
    mut evo_query: Query<&mut Text, With<EvoText>>,
) {
    let stats = GridStats::compute(&grid);

    for mut text in query.iter_mut() {
        text.sections[1].value = format!(
            "种群总数: {}\n\
             ├─ 草: {} (健康: {:.1})\n\
             ├─ 灌木: {} (健康: {:.1})\n\
             └─ 树: {} (健康: {:.1})\n\
             平均健康度: {:.1}\n\
             \n\
             空格: 暂停/继续 | ↑↓: 加速/减速\n\
             R: 重置模拟",
            stats.total_count,
            stats.grass_count, stats.grass_health,
            stats.shrub_count, stats.shrub_health,
            stats.tree_count, stats.tree_health,
            stats.avg_health,
        );
    }

    for mut text in time_query.iter_mut() {
        text.sections[0].value = format!(
            "时间步: {} | 速度: {:.1}x {}",
            time.tick,
            time.speed,
            if time.paused { "[已暂停]" } else { "" }
        );
    }

    let dist = TraitDistribution::compute(&grid);
    let divergence = compute_niche_divergence(&grid);

    for mut text in evo_query.iter_mut() {
        text.sections[1].value = format!(
            "代数: 平均 {:.1} / 最大 {}\n\
             谱系数量: {}\n\
             出生: {} | 死亡: {}\n\
             累计变异: {}\n\
             生态位分化: {:.3}\n\
             \n\
             -- 性状分布 --\n\
             生长速率: {:.2} ± {:.2} [{:.2} ~ {:.2}]\n\
             耐旱性:   {:.2} ± {:.2} [{:.2} ~ {:.2}]\n\
             种子数:   {:.2} ± {:.2} [{:.2} ~ {:.2}]\n\
             \n\
             -- 物种生态位 --\n\
             草:   GR={:.2}±{:.2} DT={:.2}±{:.2}\n\
             灌木: GR={:.2}±{:.2} DT={:.2}±{:.2}\n\
             树:   GR={:.2}±{:.2} DT={:.2}±{:.2}",
            stats.avg_generation, stats.max_generation,
            stats.unique_lineages,
            evo_stats.total_births, evo_stats.total_deaths,
            evo_stats.total_mutations,
            divergence,
            dist.growth_rate.avg, dist.growth_rate.std_dev, dist.growth_rate.min, dist.growth_rate.max,
            dist.drought_tolerance.avg, dist.drought_tolerance.std_dev, dist.drought_tolerance.min, dist.drought_tolerance.max,
            dist.seed_multiplier.avg, dist.seed_multiplier.std_dev, dist.seed_multiplier.min, dist.seed_multiplier.max,
            dist.grass_growth.avg, dist.grass_growth.std_dev,
            dist.grass_drought.avg, dist.grass_drought.std_dev,
            dist.shrub_growth.avg, dist.shrub_growth.std_dev,
            dist.shrub_drought.avg, dist.shrub_drought.std_dev,
            dist.tree_growth.avg, dist.tree_growth.std_dev,
            dist.tree_drought.avg, dist.tree_drought.std_dev,
        );
    }
}

fn draw_curves(
    history: Res<StatsHistory>,
    mut gizmos: Gizmos,
) {
    let origin = Vec2::new(-CANVAS_WIDTH / 2.0 + 10.0, -CANVAS_HEIGHT / 2.0 + 10.0);
    let plot_w = CANVAS_WIDTH - 20.0;
    let plot_h = CANVAS_HEIGHT - 40.0;

    gizmos.rect_2d(
        Vec2::new(0.0, 0.0),
        Vec2::new(CANVAS_WIDTH, CANVAS_HEIGHT),
        Color::srgb(0.15, 0.15, 0.2),
    );

    let max_pop = history.total_population.iter()
        .chain(history.grass_population.iter())
        .chain(history.shrub_population.iter())
        .chain(history.tree_population.iter())
        .cloned()
        .fold(0.0_f32, f32::max)
        .max(1.0);

    let n = history.total_population.len();
    if n < 2 { return; }

    for i in 0..n-1 {
        let t1 = i as f32 / (n - 1) as f32;
        let t2 = (i + 1) as f32 / (n - 1) as f32;
        let x1 = origin.x + t1 * plot_w;
        let x2 = origin.x + t2 * plot_w;

        if i < history.total_population.len() - 1 {
            let y1 = origin.y + (history.total_population[i] / max_pop) * plot_h;
            let y2 = origin.y + (history.total_population[i + 1] / max_pop) * plot_h;
            gizmos.line_2d(
                Vec2::new(x1, y1),
                Vec2::new(x2, y2),
                Color::srgb(1.0, 1.0, 1.0),
            );
        }

        if i < history.grass_population.len() - 1 {
            let y1 = origin.y + (history.grass_population[i] / max_pop) * plot_h;
            let y2 = origin.y + (history.grass_population[i + 1] / max_pop) * plot_h;
            gizmos.line_2d(
                Vec2::new(x1, y1),
                Vec2::new(x2, y2),
                Color::srgb(0.3, 0.9, 0.3),
            );
        }

        if i < history.shrub_population.len() - 1 {
            let y1 = origin.y + (history.shrub_population[i] / max_pop) * plot_h;
            let y2 = origin.y + (history.shrub_population[i + 1] / max_pop) * plot_h;
            gizmos.line_2d(
                Vec2::new(x1, y1),
                Vec2::new(x2, y2),
                Color::srgb(0.9, 0.7, 0.3),
            );
        }

        if i < history.tree_population.len() - 1 {
            let y1 = origin.y + (history.tree_population[i] / max_pop) * plot_h;
            let y2 = origin.y + (history.tree_population[i + 1] / max_pop) * plot_h;
            gizmos.line_2d(
                Vec2::new(x1, y1),
                Vec2::new(x2, y2),
                Color::srgb(0.6, 0.4, 0.9),
            );
        }
    }
}

fn draw_niche_plot(
    grid: Res<crate::grid::Grid>,
    mut gizmos: Gizmos,
) {
    let center = Vec2::new(-NICHE_WIDTH / 2.0 + NICHE_WIDTH / 2.0, -NICHE_HEIGHT / 2.0 + NICHE_HEIGHT / 2.0);
    let plot_w = NICHE_WIDTH - 40.0;
    let plot_h = NICHE_HEIGHT - 60.0;
    let origin = center + Vec2::new(-plot_w / 2.0, -plot_h / 2.0);

    gizmos.rect_2d(
        center,
        Vec2::new(NICHE_WIDTH, NICHE_HEIGHT),
        Color::srgb(0.1, 0.1, 0.14),
    );

    let max_samples = 2000;
    let mut count = 0;

    for cell in grid.cells.iter() {
        if cell.is_empty() { continue; }
        if count >= max_samples { break; }
        count += 1;

        let gr = ((cell.growth_rate - 0.3) / 2.7).clamp(0.0, 1.0);
        let dt = ((cell.drought_tolerance - 0.3) / 2.7).clamp(0.0, 1.0);

        let px = origin.x + gr * plot_w;
        let py = origin.y + dt * plot_h;

        let color = match cell.kind {
            PlantKind::Grass => Color::srgba(0.3, 0.9, 0.3, 0.4),
            PlantKind::Shrub => Color::srgba(0.9, 0.7, 0.3, 0.4),
            PlantKind::Tree => Color::srgba(0.6, 0.4, 0.9, 0.4),
            _ => continue,
        };

        gizmos.circle_2d(Vec2::new(px, py), 1.5, color);
    }

    let dist = TraitDistribution::compute(&grid);

    draw_niche_point(&mut gizmos, origin, plot_w, plot_h,
        dist.grass_growth.avg, dist.grass_drought.avg,
        Color::srgb(0.3, 1.0, 0.3), 4.0);
    draw_niche_point(&mut gizmos, origin, plot_w, plot_h,
        dist.shrub_growth.avg, dist.shrub_drought.avg,
        Color::srgb(1.0, 0.7, 0.3), 4.0);
    draw_niche_point(&mut gizmos, origin, plot_w, plot_h,
        dist.tree_growth.avg, dist.tree_drought.avg,
        Color::srgb(0.7, 0.5, 1.0), 4.0);

    let axis_color = Color::srgb(0.4, 0.4, 0.4);
    gizmos.line_2d(
        origin,
        origin + Vec2::new(plot_w, 0.0),
        axis_color,
    );
    gizmos.line_2d(
        origin,
        origin + Vec2::new(0.0, plot_h),
        axis_color,
    );
}

fn draw_niche_point(
    gizmos: &mut Gizmos,
    origin: Vec2,
    plot_w: f32,
    plot_h: f32,
    gr: f32,
    dt: f32,
    color: Color,
    size: f32,
) {
    let gr_norm = ((gr - 0.3) / 2.7).clamp(0.0, 1.0);
    let dt_norm = ((dt - 0.3) / 2.7).clamp(0.0, 1.0);
    let px = origin.x + gr_norm * plot_w;
    let py = origin.y + dt_norm * plot_h;
    gizmos.circle_2d(Vec2::new(px, py), size, color);
}

fn handle_input(
    keyboard: Res<ButtonInput<KeyCode>>,
    mut time: ResMut<SimulationTime>,
    mut reset_events: EventWriter<ResetEvent>,
) {
    if keyboard.just_pressed(KeyCode::Space) {
        time.paused = !time.paused;
    }

    if keyboard.just_pressed(KeyCode::ArrowUp) {
        time.speed = (time.speed * 2.0).min(16.0);
    }

    if keyboard.just_pressed(KeyCode::ArrowDown) {
        time.speed = (time.speed / 2.0).max(0.25);
    }

    if keyboard.just_pressed(KeyCode::KeyR) {
        reset_events.send(ResetEvent);
    }
}

fn handle_reset(
    mut reset_events: EventReader<ResetEvent>,
    mut grid: ResMut<crate::grid::Grid>,
    mut history: ResMut<StatsHistory>,
    mut niche_history: ResMut<NicheHistory>,
    mut time: ResMut<SimulationTime>,
    env: Res<EnvironmentConfig>,
    mut lineage_counter: ResMut<LineageCounter>,
    mut evo_stats: ResMut<EvolutionStats>,
) {
    for _ in reset_events.read() {
        *grid = crate::grid::Grid::new();
        *history = StatsHistory::new(history.max_points);
        *niche_history = NicheHistory::new(niche_history.max_points);
        *evo_stats = EvolutionStats::default();
        *lineage_counter = LineageCounter::default();
        time.tick = 0;
        crate::simulation::initialize_grid(grid, env, lineage_counter);
    }
}
