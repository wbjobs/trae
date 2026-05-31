use bevy::prelude::*;

#[derive(Resource)]
pub struct EnvironmentConfig {
    pub sun_intensity: f32,
    pub rainfall: f32,
    pub soil_fertility: f32,
    pub evaporation_rate: f32,
    pub nutrient_replenish: f32,
}

impl Default for EnvironmentConfig {
    fn default() -> Self {
        EnvironmentConfig {
            sun_intensity: 0.8,
            rainfall: 0.6,
            soil_fertility: 0.7,
            evaporation_rate: 0.02,
            nutrient_replenish: 0.01,
        }
    }
}

#[derive(Resource)]
pub struct SimulationParams {
    pub grass_light_need: f32,
    pub grass_water_need: f32,
    pub grass_nutrient_need: f32,
    pub grass_growth_rate: f32,
    pub grass_seedling_age: u16,
    pub grass_mature_age: u16,
    pub grass_senescent_age: u16,
    pub grass_lifespan: u16,
    pub grass_shade_provided: f32,
    pub grass_water_consumption: f32,
    pub grass_nutrient_consumption: f32,
    pub grass_spread_radius: i32,
    pub grass_spread_chance: f32,

    pub shrub_light_need: f32,
    pub shrub_water_need: f32,
    pub shrub_nutrient_need: f32,
    pub shrub_growth_rate: f32,
    pub shrub_seedling_age: u16,
    pub shrub_mature_age: u16,
    pub shrub_senescent_age: u16,
    pub shrub_lifespan: u16,
    pub shrub_shade_provided: f32,
    pub shrub_water_consumption: f32,
    pub shrub_nutrient_consumption: f32,
    pub shrub_spread_radius: i32,
    pub shrub_spread_chance: f32,

    pub tree_light_need: f32,
    pub tree_water_need: f32,
    pub tree_nutrient_need: f32,
    pub tree_growth_rate: f32,
    pub tree_seedling_age: u16,
    pub tree_mature_age: u16,
    pub tree_senescent_age: u16,
    pub tree_lifespan: u16,
    pub tree_shade_provided: f32,
    pub tree_water_consumption: f32,
    pub tree_nutrient_consumption: f32,
    pub tree_spread_radius: i32,
    pub tree_spread_chance: f32,
}

impl Default for SimulationParams {
    fn default() -> Self {
        SimulationParams {
            grass_light_need: 0.3,
            grass_water_need: 0.2,
            grass_nutrient_need: 0.1,
            grass_growth_rate: 2.0,
            grass_seedling_age: 5,
            grass_mature_age: 20,
            grass_senescent_age: 80,
            grass_lifespan: 120,
            grass_shade_provided: 0.1,
            grass_water_consumption: 0.1,
            grass_nutrient_consumption: 0.05,
            grass_spread_radius: 2,
            grass_spread_chance: 0.05,

            shrub_light_need: 0.5,
            shrub_water_need: 0.4,
            shrub_nutrient_need: 0.3,
            shrub_growth_rate: 1.0,
            shrub_seedling_age: 15,
            shrub_mature_age: 50,
            shrub_senescent_age: 200,
            shrub_lifespan: 300,
            shrub_shade_provided: 0.4,
            shrub_water_consumption: 0.3,
            shrub_nutrient_consumption: 0.15,
            shrub_spread_radius: 3,
            shrub_spread_chance: 0.02,

            tree_light_need: 0.8,
            tree_water_need: 0.6,
            tree_nutrient_need: 0.5,
            tree_growth_rate: 0.5,
            tree_seedling_age: 30,
            tree_mature_age: 100,
            tree_senescent_age: 400,
            tree_lifespan: 600,
            tree_shade_provided: 0.8,
            tree_water_consumption: 0.5,
            tree_nutrient_consumption: 0.3,
            tree_spread_radius: 4,
            tree_spread_chance: 0.005,
        }
    }
}

#[derive(Resource, Clone)]
pub struct StatsHistory {
    pub max_points: usize,
    pub total_population: Vec<f32>,
    pub grass_population: Vec<f32>,
    pub shrub_population: Vec<f32>,
    pub tree_population: Vec<f32>,
    pub avg_health: Vec<f32>,
    pub grass_health: Vec<f32>,
    pub shrub_health: Vec<f32>,
    pub tree_health: Vec<f32>,
}

impl StatsHistory {
    pub fn new(max_points: usize) -> Self {
        StatsHistory {
            max_points,
            total_population: Vec::new(),
            grass_population: Vec::new(),
            shrub_population: Vec::new(),
            tree_population: Vec::new(),
            avg_health: Vec::new(),
            grass_health: Vec::new(),
            shrub_health: Vec::new(),
            tree_health: Vec::new(),
        }
    }

    pub fn push(&mut self, total: u32, grass: u32, shrub: u32, tree: u32,
                avg_h: f32, grass_h: f32, shrub_h: f32, tree_h: f32) {
        self.push_or_truncate(&mut self.total_population, total as f32);
        self.push_or_truncate(&mut self.grass_population, grass as f32);
        self.push_or_truncate(&mut self.shrub_population, shrub as f32);
        self.push_or_truncate(&mut self.tree_population, tree as f32);
        self.push_or_truncate(&mut self.avg_health, avg_h);
        self.push_or_truncate(&mut self.grass_health, grass_h);
        self.push_or_truncate(&mut self.shrub_health, shrub_h);
        self.push_or_truncate(&mut self.tree_health, tree_h);
    }

    fn push_or_truncate(&self, v: &mut Vec<f32>, val: f32) {
        v.push(val);
        if v.len() > self.max_points {
            v.remove(0);
        }
    }
}

#[derive(Resource)]
pub struct SimulationTime {
    pub tick: u64,
    pub paused: bool,
    pub speed: f32,
}

impl Default for SimulationTime {
    fn default() -> Self {
        SimulationTime {
            tick: 0,
            paused: false,
            speed: 1.0,
        }
    }
}
