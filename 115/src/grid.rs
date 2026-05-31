use std::ops::{Index, IndexMut};

pub const GRID_SIZE: usize = 1000;
pub const GRID_CELLS: usize = GRID_SIZE * GRID_SIZE;

#[derive(Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum PlantKind {
    Empty = 0,
    Grass = 1,
    Shrub = 2,
    Tree = 3,
}

#[derive(Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum GrowthStage {
    Seed = 0,
    Seedling = 1,
    Mature = 2,
    Senescent = 3,
}

#[derive(Clone, Copy)]
pub struct Plant {
    pub kind: PlantKind,
    pub stage: GrowthStage,
    pub health: f32,
    pub age: u16,
    pub light: f32,
    pub water: f32,
    pub nutrients: f32,
    pub growth_rate: f32,
    pub drought_tolerance: f32,
    pub seed_multiplier: f32,
    pub generation: u32,
    pub lineage_id: u32,
}

impl Plant {
    pub const EMPTY: Plant = Plant {
        kind: PlantKind::Empty,
        stage: GrowthStage::Seed,
        health: 0.0,
        age: 0,
        light: 0.0,
        water: 0.0,
        nutrients: 0.0,
        growth_rate: 1.0,
        drought_tolerance: 1.0,
        seed_multiplier: 1.0,
        generation: 0,
        lineage_id: 0,
    };

    pub fn new(kind: PlantKind) -> Self {
        Plant {
            kind,
            stage: GrowthStage::Seed,
            health: 100.0,
            age: 0,
            light: 0.0,
            water: 0.0,
            nutrients: 0.0,
            growth_rate: 1.0,
            drought_tolerance: 1.0,
            seed_multiplier: 1.0,
            generation: 0,
            lineage_id: 0,
        }
    }

    pub fn new_with_traits(
        kind: PlantKind,
        growth_rate: f32,
        drought_tolerance: f32,
        seed_multiplier: f32,
        generation: u32,
        lineage_id: u32,
    ) -> Self {
        Plant {
            kind,
            stage: GrowthStage::Seed,
            health: 100.0,
            age: 0,
            light: 0.0,
            water: 0.0,
            nutrients: 0.0,
            growth_rate,
            drought_tolerance,
            seed_multiplier,
            generation,
            lineage_id,
        }
    }

    pub fn is_empty(&self) -> bool {
        self.kind == PlantKind::Empty
    }
}

pub struct Grid {
    pub cells: Box<[Plant; GRID_CELLS]>,
    pub light: Box<[f32; GRID_CELLS]>,
    pub water: Box<[f32; GRID_CELLS]>,
    pub nutrients: Box<[f32; GRID_CELLS]>,
}

impl Grid {
    pub fn new() -> Self {
        Grid {
            cells: Box::new([Plant::EMPTY; GRID_CELLS]),
            light: Box::new([0.0; GRID_CELLS]),
            water: Box::new([0.0; GRID_CELLS]),
            nutrients: Box::new([0.0; GRID_CELLS]),
        }
    }

    #[inline]
    pub fn idx(x: usize, y: usize) -> usize {
        y * GRID_SIZE + x
    }

    #[inline]
    pub fn get(&self, x: usize, y: usize) -> Plant {
        self.cells[Self::idx(x, y)]
    }

    #[inline]
    pub fn get_mut(&mut self, x: usize, y: usize) -> &mut Plant {
        &mut self.cells[Self::idx(x, y)]
    }

    #[inline]
    pub fn set(&mut self, x: usize, y: usize, plant: Plant) {
        self.cells[Self::idx(x, y)] = plant;
    }
}

impl Index<(usize, usize)> for Grid {
    type Output = Plant;

    #[inline]
    fn index(&self, (x, y): (usize, usize)) -> &Self::Output {
        &self.cells[Self::idx(x, y)]
    }
}

impl IndexMut<(usize, usize)> for Grid {
    #[inline]
    fn index_mut(&mut self, (x, y): (usize, usize)) -> &mut Self::Output {
        &mut self.cells[Self::idx(x, y)]
    }
}

pub struct GridStats {
    pub grass_count: u32,
    pub shrub_count: u32,
    pub tree_count: u32,
    pub total_count: u32,
    pub avg_health: f32,
    pub grass_health: f32,
    pub shrub_health: f32,
    pub tree_health: f32,
    pub avg_generation: f32,
    pub max_generation: u32,
    pub unique_lineages: u32,
}

impl GridStats {
    pub fn new() -> Self {
        GridStats {
            grass_count: 0,
            shrub_count: 0,
            tree_count: 0,
            total_count: 0,
            avg_health: 0.0,
            grass_health: 0.0,
            shrub_health: 0.0,
            tree_health: 0.0,
            avg_generation: 0.0,
            max_generation: 0,
            unique_lineages: 0,
        }
    }

    pub fn compute(grid: &Grid) -> Self {
        let mut stats = GridStats::new();
        let mut grass_h: f64 = 0.0;
        let mut shrub_h: f64 = 0.0;
        let mut tree_h: f64 = 0.0;
        let mut total_h: f64 = 0.0;
        let mut total_gen: f64 = 0.0;
        let mut lineages: std::collections::HashSet<u32> = std::collections::HashSet::new();

        for cell in grid.cells.iter() {
            if cell.is_empty() { continue; }
            match cell.kind {
                PlantKind::Grass => {
                    stats.grass_count += 1;
                    grass_h += cell.health as f64;
                }
                PlantKind::Shrub => {
                    stats.shrub_count += 1;
                    shrub_h += cell.health as f64;
                }
                PlantKind::Tree => {
                    stats.tree_count += 1;
                    tree_h += cell.health as f64;
                }
                _ => {}
            }
            total_h += cell.health as f64;
            total_gen += cell.generation as f64;
            stats.max_generation = stats.max_generation.max(cell.generation);
            lineages.insert(cell.lineage_id);
            stats.total_count += 1;
        }

        stats.unique_lineages = lineages.len() as u32;

        if stats.grass_count > 0 {
            stats.grass_health = (grass_h / stats.grass_count as f64) as f32;
        }
        if stats.shrub_count > 0 {
            stats.shrub_health = (shrub_h / stats.shrub_count as f64) as f32;
        }
        if stats.tree_count > 0 {
            stats.tree_health = (tree_h / stats.tree_count as f64) as f32;
        }
        if stats.total_count > 0 {
            stats.avg_health = (total_h / stats.total_count as f64) as f32;
            stats.avg_generation = (total_gen / stats.total_count as f64) as f32;
        }

        stats
    }
}

#[derive(Clone, Copy, Debug)]
pub struct TraitStats {
    pub count: u32,
    pub min: f32,
    pub max: f32,
    pub avg: f32,
    pub std_dev: f32,
}

impl TraitStats {
    pub fn new() -> Self {
        TraitStats { count: 0, min: f32::MAX, max: f32::MIN, avg: 0.0, std_dev: 0.0 }
    }
}

pub struct TraitDistribution {
    pub growth_rate: TraitStats,
    pub drought_tolerance: TraitStats,
    pub seed_multiplier: TraitStats,
    pub grass_growth: TraitStats,
    pub shrub_growth: TraitStats,
    pub tree_growth: TraitStats,
    pub grass_drought: TraitStats,
    pub shrub_drought: TraitStats,
    pub tree_drought: TraitStats,
}

impl TraitDistribution {
    pub fn new() -> Self {
        TraitDistribution {
            growth_rate: TraitStats::new(),
            drought_tolerance: TraitStats::new(),
            seed_multiplier: TraitStats::new(),
            grass_growth: TraitStats::new(),
            shrub_growth: TraitStats::new(),
            tree_growth: TraitStats::new(),
            grass_drought: TraitStats::new(),
            shrub_drought: TraitStats::new(),
            tree_drought: TraitStats::new(),
        }
    }

    pub fn compute(grid: &Grid) -> Self {
        let mut dist = TraitDistribution::new();
        let mut gr_sum: f64 = 0.0;
        let mut gr_sq: f64 = 0.0;
        let mut dt_sum: f64 = 0.0;
        let mut dt_sq: f64 = 0.0;
        let mut sm_sum: f64 = 0.0;
        let mut sm_sq: f64 = 0.0;
        let mut count: f64 = 0.0;

        let mut gr_grass: (f64, f64, f64, f32, f32) = (0.0, 0.0, 0.0, f32::MAX, f32::MIN);
        let mut gr_shrub: (f64, f64, f64, f32, f32) = (0.0, 0.0, 0.0, f32::MAX, f32::MIN);
        let mut gr_tree: (f64, f64, f64, f32, f32) = (0.0, 0.0, 0.0, f32::MAX, f32::MIN);
        let mut dt_grass: (f64, f64, f64, f32, f32) = (0.0, 0.0, 0.0, f32::MAX, f32::MIN);
        let mut dt_shrub: (f64, f64, f64, f32, f32) = (0.0, 0.0, 0.0, f32::MAX, f32::MIN);
        let mut dt_tree: (f64, f64, f64, f32, f32) = (0.0, 0.0, 0.0, f32::MAX, f32::MIN);

        for cell in grid.cells.iter() {
            if cell.is_empty() { continue; }

            let gr = cell.growth_rate;
            let dt = cell.drought_tolerance;
            let sm = cell.seed_multiplier;

            gr_sum += gr as f64;
            gr_sq += (gr * gr) as f64;
            dt_sum += dt as f64;
            dt_sq += (dt * dt) as f64;
            sm_sum += sm as f64;
            sm_sq += (sm * sm) as f64;
            count += 1.0;

            dist.growth_rate.min = dist.growth_rate.min.min(gr);
            dist.growth_rate.max = dist.growth_rate.max.max(gr);
            dist.drought_tolerance.min = dist.drought_tolerance.min.min(dt);
            dist.drought_tolerance.max = dist.drought_tolerance.max.max(dt);
            dist.seed_multiplier.min = dist.seed_multiplier.min.min(sm);
            dist.seed_multiplier.max = dist.seed_multiplier.max.max(sm);

            match cell.kind {
                PlantKind::Grass => {
                    gr_grass.0 += gr as f64;
                    gr_grass.1 += (gr * gr) as f64;
                    gr_grass.2 += 1.0;
                    gr_grass.3 = gr_grass.3.min(gr);
                    gr_grass.4 = gr_grass.4.max(gr);
                    dt_grass.0 += dt as f64;
                    dt_grass.1 += (dt * dt) as f64;
                    dt_grass.2 += 1.0;
                    dt_grass.3 = dt_grass.3.min(dt);
                    dt_grass.4 = dt_grass.4.max(dt);
                }
                PlantKind::Shrub => {
                    gr_shrub.0 += gr as f64;
                    gr_shrub.1 += (gr * gr) as f64;
                    gr_shrub.2 += 1.0;
                    gr_shrub.3 = gr_shrub.3.min(gr);
                    gr_shrub.4 = gr_shrub.4.max(gr);
                    dt_shrub.0 += dt as f64;
                    dt_shrub.1 += (dt * dt) as f64;
                    dt_shrub.2 += 1.0;
                    dt_shrub.3 = dt_shrub.3.min(dt);
                    dt_shrub.4 = dt_shrub.4.max(dt);
                }
                PlantKind::Tree => {
                    gr_tree.0 += gr as f64;
                    gr_tree.1 += (gr * gr) as f64;
                    gr_tree.2 += 1.0;
                    gr_tree.3 = gr_tree.3.min(gr);
                    gr_tree.4 = gr_tree.4.max(gr);
                    dt_tree.0 += dt as f64;
                    dt_tree.1 += (dt * dt) as f64;
                    dt_tree.2 += 1.0;
                    dt_tree.3 = dt_tree.3.min(dt);
                    dt_tree.4 = dt_tree.4.max(dt);
                }
                _ => {}
            }
        }

        if count > 0.0 {
            dist.growth_rate.avg = (gr_sum / count) as f32;
            dist.growth_rate.std_dev = ((gr_sq / count - (gr_sum / count).powi(2)).sqrt()) as f32;
            dist.drought_tolerance.avg = (dt_sum / count) as f32;
            dist.drought_tolerance.std_dev = ((dt_sq / count - (dt_sum / count).powi(2)).sqrt()) as f32;
            dist.seed_multiplier.avg = (sm_sum / count) as f32;
            dist.seed_multiplier.std_dev = ((sm_sq / count - (sm_sum / count).powi(2)).sqrt()) as f32;
            dist.growth_rate.count = count as u32;
            dist.drought_tolerance.count = count as u32;
            dist.seed_multiplier.count = count as u32;
        }

        fn calc_stats(data: (f64, f64, f64, f32, f32)) -> TraitStats {
            if data.2 > 0.0 {
                let avg = (data.0 / data.2) as f32;
                let var = (data.1 / data.2 - (data.0 / data.2).powi(2)).max(0.0);
                TraitStats {
                    count: data.2 as u32,
                    min: data.3,
                    max: data.4,
                    avg,
                    std_dev: var.sqrt() as f32,
                }
            } else {
                TraitStats::new()
            }
        }

        dist.grass_growth = calc_stats(gr_grass);
        dist.shrub_growth = calc_stats(gr_shrub);
        dist.tree_growth = calc_stats(gr_tree);
        dist.grass_drought = calc_stats(dt_grass);
        dist.shrub_drought = calc_stats(dt_shrub);
        dist.tree_drought = calc_stats(dt_tree);

        dist
    }
}
