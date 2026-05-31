use bevy::prelude::*;
use rand::Rng;

use crate::environment::*;
use crate::evolution::*;
use crate::grid::*;

pub const MAX_INITIAL_PLANTS: usize = 50_000;

pub fn initialize_grid(
    mut grid: ResMut<Grid>,
    env: Res<EnvironmentConfig>,
    mut lineage_counter: ResMut<LineageCounter>,
) {
    let mut rng = rand::thread_rng();

    for y in 0..GRID_SIZE {
        for x in 0..GRID_SIZE {
            let idx = Grid::idx(x, y);
            grid.light[idx] = env.sun_intensity;
            grid.water[idx] = env.rainfall * rng.gen_range(0.5..1.5);
            grid.nutrients[idx] = env.soil_fertility * rng.gen_range(0.5..1.5);
        }
    }

    for _ in 0..MAX_INITIAL_PLANTS {
        let x = rng.gen_range(0..GRID_SIZE);
        let y = rng.gen_range(0..GRID_SIZE);
        let idx = Grid::idx(x, y);

        if grid.cells[idx].is_empty() {
            let kind = match rng.gen_range(0..10) {
                0..=6 => PlantKind::Grass,
                7..=9 => PlantKind::Shrub,
                _ => PlantKind::Tree,
            };
            let growth_rate = rng.gen_range(0.8..1.2);
            let drought_tolerance = rng.gen_range(0.8..1.2);
            let seed_multiplier = rng.gen_range(0.8..1.2);
            let lineage_id = lineage_counter.allocate();
            grid.cells[idx] = Plant::new_with_traits(
                kind,
                growth_rate,
                drought_tolerance,
                seed_multiplier,
                0,
                lineage_id,
            );
            let age = rng.gen_range(0..30);
            grid.cells[idx].age = age;
            if age > 0 {
                grid.cells[idx].stage = if age >= 20 { GrowthStage::Mature } else { GrowthStage::Seedling };
            }
        }
    }
}

#[derive(Resource)]
pub struct SimBuffers {
    pub shade_source: Box<[f32; GRID_CELLS]>,
    pub shade_scratch: Box<[f32; GRID_CELLS]>,
    pub mature_plants: Vec<(usize, Plant)>,
    pub new_plant_targets: Vec<(usize, usize, Plant)>,
}

impl SimBuffers {
    pub fn new() -> Self {
        SimBuffers {
            shade_source: Box::new([0.0; GRID_CELLS]),
            shade_scratch: Box::new([0.0; GRID_CELLS]),
            mature_plants: Vec::with_capacity(200_000),
            new_plant_targets: Vec::with_capacity(50_000),
        }
    }
}

impl Default for SimBuffers {
    fn default() -> Self {
        Self::new()
    }
}

const SHADE_RADIUS: i32 = 2;

fn box_blur_1d(src: &[f32; GRID_CELLS], dst: &mut [f32; GRID_CELLS], horizontal: bool) {
    let radius = SHADE_RADIUS as usize;
    let diameter = radius * 2 + 1;
    let inv_diameter = 1.0 / diameter as f32;

    if horizontal {
        for y in 0..GRID_SIZE {
            let row_start = y * GRID_SIZE;
            let mut sum: f32 = 0.0;
            for x in 0..radius.min(GRID_SIZE) {
                sum += src[row_start + x];
            }

            for x in 0..GRID_SIZE {
                let add_x = x + radius;
                if add_x < GRID_SIZE {
                    sum += src[row_start + add_x];
                }
                let remove_x = x as i32 - radius as i32 - 1;
                if remove_x >= 0 {
                    sum -= src[row_start + remove_x as usize];
                }

                let actual_count = if x < radius {
                    (x + radius + 1) as f32
                } else if x + radius >= GRID_SIZE {
                    (GRID_SIZE as i32 - (x as i32 - radius as i32)) as f32
                } else {
                    diameter as f32
                };

                dst[row_start + x] = sum * inv_diameter * (diameter as f32 / actual_count);
            }
        }
    } else {
        for x in 0..GRID_SIZE {
            let mut sum: f32 = 0.0;
            for y in 0..radius.min(GRID_SIZE) {
                sum += src[y * GRID_SIZE + x];
            }

            for y in 0..GRID_SIZE {
                let add_y = y + radius;
                if add_y < GRID_SIZE {
                    sum += src[add_y * GRID_SIZE + x];
                }
                let remove_y = y as i32 - radius as i32 - 1;
                if remove_y >= 0 {
                    sum -= src[remove_y as usize * GRID_SIZE + x];
                }

                let actual_count = if y < radius {
                    (y + radius + 1) as f32
                } else if y + radius >= GRID_SIZE {
                    (GRID_SIZE as i32 - (y as i32 - radius as i32)) as f32
                } else {
                    diameter as f32
                };

                dst[y * GRID_SIZE + x] = sum * inv_diameter * (diameter as f32 / actual_count);
            }
        }
    }
}

pub fn simulate_environment(mut grid: ResMut<Grid>, env: Res<EnvironmentConfig>) {
    let mut rng = rand::thread_rng();

    for i in 0..GRID_CELLS {
        grid.light[i] = (grid.light[i] + env.sun_intensity * 0.1) * 0.9
            + rng.gen_range(-0.05..0.05);
        grid.light[i] = grid.light[i].clamp(0.0, 1.0);

        grid.water[i] = grid.water[i] * (1.0 - env.evaporation_rate)
            + env.rainfall * 0.05 * rng.gen_range(0.0..1.0);
        grid.water[i] = grid.water[i].clamp(0.0, 2.0);

        grid.nutrients[i] = grid.nutrients[i] * 0.995
            + env.nutrient_replenish * rng.gen_range(0.5..1.5);
        grid.nutrients[i] = grid.nutrients[i].clamp(0.0, 2.0);
    }
}

pub fn simulate_light_competition(
    mut grid: ResMut<Grid>,
    params: Res<SimulationParams>,
    mut buffers: ResMut<SimBuffers>,
) {
    let shade_source = &mut buffers.shade_source;
    let shade_scratch = &mut buffers.shade_scratch;

    for i in 0..GRID_CELLS {
        shade_source[i] = 0.0;
    }

    for i in 0..GRID_CELLS {
        let cell = &grid.cells[i];
        if cell.is_empty() { continue; }
        if (cell.stage as u8) < (GrowthStage::Seedling as u8) { continue; }

        let shade_amount = match cell.kind {
            PlantKind::Grass => params.grass_shade_provided * 0.3 * (0.5 + cell.growth_rate * 0.5),
            PlantKind::Shrub => params.shrub_shade_provided * 0.5 * (0.5 + cell.growth_rate * 0.5),
            PlantKind::Tree => params.tree_shade_provided * 0.7 * (0.5 + cell.growth_rate * 0.5),
            _ => continue,
        };

        shade_source[i] = shade_amount;
    }

    box_blur_1d(shade_source, shade_scratch, true);
    box_blur_1d(shade_scratch, shade_source, false);

    for i in 0..GRID_CELLS {
        grid.light[i] = (grid.light[i] - shade_source[i]).clamp(0.0, 1.0);
    }
}

pub fn simulate_plants(
    mut grid: ResMut<Grid>,
    params: Res<SimulationParams>,
    mut time: ResMut<SimulationTime>,
    mut buffers: ResMut<SimBuffers>,
    evo_config: Res<EvolutionConfig>,
    mut lineage_counter: ResMut<LineageCounter>,
    mut evo_stats: ResMut<EvolutionStats>,
) {
    if time.paused { return; }

    let mut rng = rand::thread_rng();
    buffers.mature_plants.clear();
    buffers.new_plant_targets.clear();

    for i in 0..GRID_CELLS {
        let mut plant = grid.cells[i];
        if plant.is_empty() { continue; }

        plant.age = plant.age.saturating_add(1);

        let (light_need, water_need_base, nutrient_need,
             seedling_age, mature_age, senescent_age, lifespan) = match plant.kind {
            PlantKind::Grass => (
                params.grass_light_need, params.grass_water_need,
                params.grass_nutrient_need,
                params.grass_seedling_age, params.grass_mature_age,
                params.grass_senescent_age, params.grass_lifespan,
            ),
            PlantKind::Shrub => (
                params.shrub_light_need, params.shrub_water_need,
                params.shrub_nutrient_need,
                params.shrub_seedling_age, params.shrub_mature_age,
                params.shrub_senescent_age, params.shrub_lifespan,
            ),
            PlantKind::Tree => (
                params.tree_light_need, params.tree_water_need,
                params.tree_nutrient_need,
                params.tree_seedling_age, params.tree_mature_age,
                params.tree_senescent_age, params.tree_lifespan,
            ),
            _ => continue,
        };

        let effective_water_need = water_need_base / plant.drought_tolerance.max(0.1);

        let growth_rate_eff = plant.growth_rate;

        let light_factor = grid.light[i] / light_need.max(0.001);
        let water_factor = grid.water[i] / effective_water_need.max(0.001);
        let nutrient_factor = grid.nutrients[i] / nutrient_need.max(0.001);

        let min_factor = light_factor.min(water_factor).min(nutrient_factor);

        plant.light = grid.light[i];
        plant.water = grid.water[i];
        plant.nutrients = grid.nutrients[i];

        if plant.stage != GrowthStage::Seed {
            let water_consume = water_need_base * 0.1 / plant.drought_tolerance.max(0.1);
            let nutrient_consume = nutrient_need * 0.1;
            grid.water[i] = (grid.water[i] - water_consume).max(0.0);
            grid.nutrients[i] = (grid.nutrients[i] - nutrient_consume).max(0.0);
        }

        let health_change = if min_factor >= 1.0 {
            growth_rate_eff * 0.5 * min_factor
        } else {
            -2.0 * (1.0 - min_factor)
        };
        plant.health = (plant.health + health_change).clamp(0.0, 100.0);

        if plant.age as u16 >= lifespan || plant.health <= 0.0 {
            grid.cells[i] = Plant::EMPTY;
            evo_stats.total_deaths += 1;
            continue;
        }

        let x = i % GRID_SIZE;
        let y = i / GRID_SIZE;

        match plant.stage {
            GrowthStage::Seed => {
                if plant.age >= 2 && grid.water[i] > effective_water_need * 0.3 {
                    plant.stage = GrowthStage::Seedling;
                }
            }
            GrowthStage::Seedling => {
                let adjusted_seedling_age = (seedling_age as f32 / growth_rate_eff.max(0.1)) as u16;
                if plant.age >= adjusted_seedling_age && plant.health > 30.0 {
                    plant.stage = GrowthStage::Mature;
                }
            }
            GrowthStage::Mature => {
                let adjusted_mature_age = (mature_age as f32 / growth_rate_eff.max(0.1)) as u16;
                if plant.age >= adjusted_mature_age {
                    plant.stage = GrowthStage::Senescent;
                } else {
                    buffers.mature_plants.push((i, plant));
                }
            }
            GrowthStage::Senescent => {
                if plant.health < 20.0 || plant.age >= senescent_age {
                    grid.cells[i] = Plant::EMPTY;
                    evo_stats.total_deaths += 1;
                    continue;
                }
            }
        }

        grid.cells[i] = plant;
    }

    for &(parent_idx, parent) in buffers.mature_plants.iter() {
        let (spread_radius, spread_chance_base) = match parent.kind {
            PlantKind::Grass => (params.grass_spread_radius, params.grass_spread_chance),
            PlantKind::Shrub => (params.shrub_spread_radius, params.shrub_spread_chance),
            PlantKind::Tree => (params.tree_spread_radius, params.tree_spread_chance),
            _ => continue,
        };

        let spread_chance = spread_chance_base * parent.seed_multiplier;

        if rng.gen::<f32>() < spread_chance {
            let x = parent_idx % GRID_SIZE;
            let y = parent_idx / GRID_SIZE;
            let dx = rng.gen_range(-spread_radius..=spread_radius);
            let dy = rng.gen_range(-spread_radius..=spread_radius);
            let nx = x as i32 + dx;
            let ny = y as i32 + dy;
            if nx >= 0 && nx < GRID_SIZE as i32 && ny >= 0 && ny < GRID_SIZE as i32 {
                let child = reproduce(
                    &parent,
                    &evo_config,
                    &mut lineage_counter,
                    &mut evo_stats,
                    &mut rng,
                );
                buffers.new_plant_targets.push((nx as usize, ny as usize, child));
            }
        }
    }

    for &(x, y, ref child) in buffers.new_plant_targets.iter() {
        let idx = Grid::idx(x, y);
        if grid.cells[idx].is_empty() {
            grid.cells[idx] = *child;
        }
    }

    time.tick = time.tick.saturating_add(1);
}

pub fn update_stats(
    mut history: ResMut<StatsHistory>,
    mut niche_history: ResMut<NicheHistory>,
    grid: Res<Grid>,
    mut evo_stats: ResMut<EvolutionStats>,
) {
    let stats = GridStats::compute(&grid);
    history.push(
        stats.total_count,
        stats.grass_count,
        stats.shrub_count,
        stats.tree_count,
        stats.avg_health,
        stats.grass_health,
        stats.shrub_health,
        stats.tree_health,
    );

    evo_stats.max_generation = stats.max_generation;
    evo_stats.unique_lineages = stats.unique_lineages;

    niche_history.push(&grid);
}
