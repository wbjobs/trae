extends Node3D

@export var terrain_data: TerrainData
@export var terrain_mesh: TerrainMesh
@export var volume_tracker: VolumeTracker

@export var explosion_radius_min: float = 5.0
@export var explosion_radius_max: float = 20.0
@export var explosion_depth: float = 2.0

@onready var camera: Camera3D = $Camera3D
@onready var label: Label = $CanvasLayer/UI/VBoxContainer/InfoLabel

var explosive_scene: PackedScene = preload("res://scenes/explosive.tscn")

func _ready() -> void:
    _setup_terrain()
    _update_ui()

func _setup_terrain() -> void:
    if not terrain_data:
        terrain_data = TerrainData.new()
        terrain_data.initialize(1.0, 0.0, 100.0)
        terrain_data.generate_perlin_terrain(42, 4.0, 6, 0.5)

    if not volume_tracker:
        volume_tracker = VolumeTracker.new()

    if terrain_mesh:
        terrain_mesh.setup_terrain(terrain_data)

func _update_ui() -> void:
    if label:
        var info := "=== 地形破坏系统 ===\n"
        info += "左键点击: 创建爆炸坑\n"
        info += "右键点击: 创建地形堆\n"
        info += "R键: 重置地形\n"
        info += "H键: 显示/隐藏帮助\n\n"
        info += volume_tracker.get_summary()
        label.text = info

func _unhandled_input(event: InputEvent) -> void:
    if event is InputEventMouseButton and event.pressed:
        var ray_origin: Vector3 = camera.project_ray_origin(event.position)
        var ray_dir: Vector3 = camera.project_ray_normal(event.position)

        var hit := _raycast_terrain(ray_origin, ray_dir)
        if hit:
            if event.button_index == MOUSE_BUTTON_LEFT:
                _create_explosion(hit, false)
            elif event.button_index == MOUSE_BUTTON_RIGHT:
                _create_explosion(hit, true)

    elif event is InputEventKey and event.pressed:
        if event.keycode == KEY_R:
            terrain_data.reset_to_original()
            terrain_mesh.update_textures()
            terrain_mesh.generate_mesh(0)
            volume_tracker.reset()
            _update_ui()
        elif event.keycode == KEY_H:
            if label:
                label.visible = not label.visible

func _raycast_terrain(origin: Vector3, direction: Vector3) -> Vector3:
    var step: float = 0.5
    var max_distance: float = 500.0
    var current_pos: Vector3 = origin

    for i in range(int(max_distance / step)):
        current_pos += direction * step
        var terrain_height: float = _get_height_at(current_pos)

        if current_pos.y <= terrain_height and terrain_data.is_point_inside(current_pos):
            return Vector3(current_pos.x, terrain_height, current_pos.z)

    return Vector3.ZERO

func _get_height_at(pos: Vector3) -> float:
    var coords: Vector2 = terrain_data.get_terrain_coords(pos)
    var x: int = int(coords.x)
    var z: int = int(coords.y)
    return terrain_data.get_height(x, z)

func _create_explosion(pos: Vector3, is_additive: bool) -> void:
    var explosive: Explosive = explosive_scene.instantiate()
    explosive.global_position = pos
    explosive.set_explosion_radius(randf_range(explosion_radius_min, explosion_radius_max))
    explosive.set_explosion_depth(explosion_depth)
    explosive.set_is_additive(is_additive)
    explosive.set_terrain_data(terrain_data)
    explosive.set_volume_tracker(volume_tracker)

    add_child(explosive)

    await get_tree().create_timer(0.1).timeout
    explosive.explode()

    terrain_mesh.update_textures()
    terrain_mesh.generate_mesh(0)
    _update_ui()
