use bevy::prelude::*;
use bevy::render::render_resource::{
    Extent3d, TextureDimension, TextureFormat,
};

use crate::grid::*;

pub const RENDER_SIZE: u32 = 800;

pub struct RenderPlugin;

impl Plugin for RenderPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, setup_render)
            .add_systems(Update, update_render_texture);
    }
}

#[derive(Resource)]
pub struct RenderTextureHandle(pub Handle<Image>);

#[derive(Resource)]
pub struct RenderData {
    pub pixels: Vec<u8>,
}

pub fn setup_render(mut commands: Commands, mut images: ResMut<Assets<Image>>) {
    let size = Extent3d {
        width: GRID_SIZE as u32,
        height: GRID_SIZE as u32,
        depth_or_array_layers: 1,
    };

    let mut image = Image::new_fill(
        size,
        TextureDimension::D2,
        &[0, 0, 0, 255],
        TextureFormat::Rgba8UnormSrgb,
    );
    image.sampler = bevy::render::texture::ImageSampler::nearest();

    let handle = images.add(image);

    commands.spawn(SpriteBundle {
        texture: handle.clone(),
        sprite: Sprite {
            custom_size: Some(Vec2::new(RENDER_SIZE as f32, RENDER_SIZE as f32)),
            ..default()
        },
        transform: Transform::from_xyz(-RENDER_SIZE as f32 / 2.0 - 150.0, 0.0, 0.0),
        ..default()
    });

    commands.insert_resource(RenderTextureHandle(handle));
    commands.insert_resource(RenderData {
        pixels: vec![0u8; GRID_SIZE * GRID_SIZE * 4],
    });
}

fn plant_color(kind: PlantKind, stage: GrowthStage, health: f32) -> [u8; 4] {
    let health_factor = (health / 100.0).clamp(0.0, 1.0);

    let base = match (kind, stage) {
        (PlantKind::Grass, GrowthStage::Seed) => [120, 100, 50, 255],
        (PlantKind::Grass, GrowthStage::Seedling) => [100, 180, 80, 255],
        (PlantKind::Grass, GrowthStage::Mature) => [50, 200, 50, 255],
        (PlantKind::Grass, GrowthStage::Senescent) => [180, 180, 80, 255],

        (PlantKind::Shrub, GrowthStage::Seed) => [130, 110, 60, 255],
        (PlantKind::Shrub, GrowthStage::Seedling) => [80, 160, 60, 255],
        (PlantKind::Shrub, GrowthStage::Mature) => [30, 150, 30, 255],
        (PlantKind::Shrub, GrowthStage::Senescent) => [160, 160, 60, 255],

        (PlantKind::Tree, GrowthStage::Seed) => [140, 120, 70, 255],
        (PlantKind::Tree, GrowthStage::Seedling) => [70, 140, 50, 255],
        (PlantKind::Tree, GrowthStage::Mature) => [20, 120, 20, 255],
        (PlantKind::Tree, GrowthStage::Senescent) => [150, 150, 70, 255],

        _ => [0, 0, 0, 0],
    };

    if base[3] == 0 {
        return [10, 15, 20, 255];
    }

    [
        (base[0] as f32 * health_factor) as u8,
        (base[1] as f32 * health_factor) as u8,
        (base[2] as f32 * health_factor) as u8,
        255,
    ]
}

pub fn update_render_texture(
    grid: Res<Grid>,
    mut render_data: ResMut<RenderData>,
    mut images: ResMut<Assets<Image>>,
    handle: Res<RenderTextureHandle>,
) {
    let pixels = &mut render_data.pixels;

    for (i, cell) in grid.cells.iter().enumerate() {
        let color = if cell.is_empty() {
            let water = grid.water[i].clamp(0.0, 1.0);
            let nutrient = grid.nutrients[i].clamp(0.0, 1.0);
            let r = (30 + nutrient * 40.0) as u8;
            let g = (25 + water * 30.0 + nutrient * 20.0) as u8;
            let b = (20 + water * 40.0) as u8;
            [r, g, b, 255]
        } else {
            plant_color(cell.kind, cell.stage, cell.health)
        };

        let pi = i * 4;
        pixels[pi] = color[0];
        pixels[pi + 1] = color[1];
        pixels[pi + 2] = color[2];
        pixels[pi + 3] = color[3];
    }

    if let Some(image) = images.get_mut(&handle.0) {
        image.data = pixels.clone();
    }
}
