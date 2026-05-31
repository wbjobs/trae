use bevy::prelude::*;
use rand::Rng;

use crate::grid::*;

#[derive(Resource, Clone)]
pub struct EvolutionConfig {
    pub mutation_rate: f32,
    pub mutation_amount: f32,
    pub growth_rate_min: f32,
    pub growth_rate_max: f32,
    pub drought_min: f32,
    pub drought_max: f32,
    pub seed_min: f32,
    pub seed_max: f32,
}

impl Default for EvolutionConfig {
    fn default() -> Self {
        EvolutionConfig {
            mutation_rate: 0.15,
            mutation_amount: 0.12,
            growth_rate_min: 0.3,
            growth_rate_max: 3.0,
            drought_min: 0.3,
            drought_max: 3.0,
            seed_min: 0.3,
            seed_max: 3.0,
        }
    }
}

#[derive(Resource)]
pub struct LineageCounter {
    pub next_id: u32,
}

impl LineageCounter {
    pub fn new(start: u32) -> Self {
        LineageCounter { next_id: start }
    }

    pub fn allocate(&mut self) -> u32 {
        let id = self.next_id;
        self.next_id = self.next_id.wrapping_add(1);
        id
    }
}

impl Default for LineageCounter {
    fn default() -> Self {
        Self::new(1)
    }
}

#[derive(Resource, Clone, Default)]
pub struct EvolutionStats {
    pub total_mutations: u64,
    pub total_births: u64,
    pub total_deaths: u64,
    pub max_generation: u32,
    pub unique_lineages: u32,
}

pub fn mutate_value(value: f32, min: f32, max: f32, amount: f32, rng: &mut impl Rng) -> f32 {
    let delta = rng.gen_range(-amount..=amount);
    (value + delta).clamp(min, max)
}

pub fn reproduce(
    parent: &Plant,
    config: &EvolutionConfig,
    lineage_counter: &mut LineageCounter,
    evo_stats: &mut EvolutionStats,
    rng: &mut impl Rng,
) -> Plant {
    let mut gr = parent.growth_rate;
    let mut dt = parent.drought_tolerance;
    let mut sm = parent.seed_multiplier;
    let mut mutated = false;

    if rng.gen::<f32>() < config.mutation_rate {
        gr = mutate_value(gr, config.growth_rate_min, config.growth_rate_max, config.mutation_amount, rng);
        mutated = true;
    }
    if rng.gen::<f32>() < config.mutation_rate {
        dt = mutate_value(dt, config.drought_min, config.drought_max, config.mutation_amount, rng);
        mutated = true;
    }
    if rng.gen::<f32>() < config.mutation_rate {
        sm = mutate_value(sm, config.seed_min, config.seed_max, config.mutation_amount, rng);
        mutated = true;
    }

    if mutated {
        evo_stats.total_mutations += 1;
    }
    evo_stats.total_births += 1;

    let lineage_id = if mutated {
        lineage_counter.allocate()
    } else {
        parent.lineage_id
    };

    Plant::new_with_traits(
        parent.kind,
        gr,
        dt,
        sm,
        parent.generation + 1,
        lineage_id,
    )
}

pub fn compute_niche_divergence(grid: &Grid) -> f32 {
    let dist = TraitDistribution::compute(grid);
    let gr_range = dist.growth_rate.max - dist.growth_rate.min;
    let dt_range = dist.drought_tolerance.max - dist.drought_tolerance.min;
    let sm_range = dist.seed_multiplier.max - dist.seed_multiplier.min;
    (gr_range + dt_range + sm_range) / 3.0
}

#[derive(Resource)]
pub struct NicheHistory {
    pub max_points: usize,
    pub divergence: Vec<f32>,
    pub grass_gr_avg: Vec<f32>,
    pub shrub_gr_avg: Vec<f32>,
    pub tree_gr_avg: Vec<f32>,
    pub grass_dt_avg: Vec<f32>,
    pub shrub_dt_avg: Vec<f32>,
    pub tree_dt_avg: Vec<f32>,
}

impl NicheHistory {
    pub fn new(max_points: usize) -> Self {
        NicheHistory {
            max_points,
            divergence: Vec::new(),
            grass_gr_avg: Vec::new(),
            shrub_gr_avg: Vec::new(),
            tree_gr_avg: Vec::new(),
            grass_dt_avg: Vec::new(),
            shrub_dt_avg: Vec::new(),
            tree_dt_avg: Vec::new(),
        }
    }

    pub fn push(&mut self, grid: &Grid) {
        let dist = TraitDistribution::compute(grid);
        let divergence = (dist.growth_rate.max - dist.growth_rate.min
            + dist.drought_tolerance.max - dist.drought_tolerance.min
            + dist.seed_multiplier.max - dist.seed_multiplier.min) / 3.0;

        self.push_val(&mut self.divergence, divergence);
        self.push_val(&mut self.grass_gr_avg, dist.grass_growth.avg);
        self.push_val(&mut self.shrub_gr_avg, dist.shrub_growth.avg);
        self.push_val(&mut self.tree_gr_avg, dist.tree_growth.avg);
        self.push_val(&mut self.grass_dt_avg, dist.grass_drought.avg);
        self.push_val(&mut self.shrub_dt_avg, dist.shrub_drought.avg);
        self.push_val(&mut self.tree_dt_avg, dist.tree_drought.avg);
    }

    fn push_val(&self, v: &mut Vec<f32>, val: f32) {
        v.push(val);
        if v.len() > self.max_points {
            v.remove(0);
        }
    }
}
