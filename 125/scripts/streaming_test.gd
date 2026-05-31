extends Node3D

@export var terrain_world: TerrainWorld
@export var volume_tracker: VolumeTracker

@export var explosion_radius_min: float = 5.0
@export var explosion_radius_max: float = 20.0
@export var explosion_depth: float = 2.0

@onready var camera: Camera3D = $Camera3D
@onready var info_label: Label = $CanvasLayer/UI/VBoxContainer/InfoLabel
@onready var stats_label: Label = $CanvasLayer/UI/VBoxContainer/StatsLabel

var explosive_scene: PackedScene = preload("res://scenes/explosive.tscn")

var camera_speed: float = 100.0
var move_forward: bool = false
var move_backward: bool = false
var move_left: bool = false
var move_right: bool = false
var move_up: bool = false
var move_down: bool = false
var mouse_position: Vector2 = Vector2.ZERO
var camera_yaw: float = 0.0
var camera_pitch: float = 0.0

var is_mouse_locked: bool = false

func _ready() -> void:
    _setup_terrain()
    Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
    is_mouse_locked = true

func _setup_terrain() -> void:
    if not terrain_world:
        terrain_world = TerrainWorld.new()
        terrain_world.set_player(node_path("Camera3D"))
        terrain_world.set_view_distance(2)
        terrain_world.set_max_loaded_chunks(16)
        terrain_world.set_terrain_scale(1.0)
        terrain_world.set_seed(randi())
        add_child(terrain_world)
        terrain_world.generate_world()

    if not volume_tracker:
        volume_tracker = VolumeTracker.new()

func _process(delta: float) -> void:
    _update_camera(delta)
    _update_stats()

func _input(event: InputEvent) -> void:
    if event is InputEventMouseMotion and is_mouse_locked:
        camera_yaw -= event.relative.x * 0.002
        camera_pitch -= event.relative.y * 0.002
        camera_pitch = clamp(camera_pitch, -1.5, 1.5)

    if event is InputEventKey:
        if event.pressed:
            match event.keycode:
                KEY_W: move_forward = true
                KEY_S: move_backward = true
                KEY_A: move_left = true
                KEY_D: move_right = true
                KEY_SPACE: move_up = true
                KEY_SHIFT: move_down = true
                KEY_R: _reset_terrain()
                KEY_1: _run_stress_test(10)
                KEY_2: _run_stress_test(100)
                KEY_T: _toggle_streaming()
                KEY_ESCAPE:
                    is_mouse_locked = not is_mouse_locked
                    Input.mouse_mode = Input.MOUSE_MODE_CAPTURED if is_mouse_locked else Input.MOUSE_MODE_VISIBLE
        elif event.is_action_released("ui_accept"):
            match event.keycode:
                KEY_W: move_forward = false
                KEY_S: move_backward = false
                KEY_A: move_left = false
                KEY_D: move_right = false
                KEY_SPACE: move_up = false
                KEY_SHIFT: move_down = false

    if event is InputEventMouseButton and event.pressed:
        if event.button_index == MOUSE_BUTTON_LEFT:
            _create_explosion(false)
        elif event.button_index == MOUSE_BUTTON_RIGHT:
            _create_explosion(true)

func _update_camera(delta: float) -> void:
    var yaw_rotation: Basis = Basis(Vector3.UP, camera_yaw)
    var pitch_rotation: Basis = Basis(Vector3.RIGHT, camera_pitch)
    camera.transform.basis = yaw_rotation * pitch_rotation

    var direction: Vector3 = Vector3.ZERO
    if move_forward: direction += camera.transform.basis.z
    if move_backward: direction -= camera.transform.basis.z
    if move_left: direction -= camera.transform.basis.x
    if move_right: direction += camera.transform.basis.x
    if move_up: direction += Vector3.UP
    if move_down: direction -= Vector3.UP

    if direction.length() > 0:
        direction = direction.normalized()
        var new_pos: Vector3 = camera.global_position + direction * camera_speed * delta
        camera.global_position = new_pos

    if is_mouse_locked:
        Input.warp_mouse(Vector2(960, 540))

func _update_stats() -> void:
    if not terrain_world:
        return

    var player_chunk: Vector2 = terrain_world.get_chunk_coords_from_world(camera.global_position)
    var loaded: int = terrain_world.get_loaded_chunk_count()
    var memory_mb: float = terrain_world.get_memory_usage_mb()
    var streaming: String = "开启" if terrain_world.get_streaming_enabled() else "关闭"

    stats_label.text = "=== 统计信息 ===\n"
    stats_label.text += "玩家区块: (%.1f, %.1f)\n" % [player_chunk.x, player_chunk.y]
    stats_label.text += "已加载区块: %d / 64\n" % loaded
    stats_label.text += "内存使用: %.2f MB / 2048 MB\n" % memory_mb
    stats_label.text += "流式加载: %s\n" % streaming
    stats_label.text += "\n" + volume_tracker.get_summary()

func _create_explosion(is_additive: bool) -> void:
    var ray_origin: Vector3 = camera.project_ray_origin(Vector2(960, 540))
    var ray_dir: Vector3 = camera.project_ray_normal(Vector2(960, 540))
    var hit_pos: Vector3 = _raycast_terrain(ray_origin, ray_dir)

    if hit_pos == Vector3.ZERO and terrain_world:
        hit_pos = camera.global_position + ray_dir * 100.0
        hit_pos.y = terrain_world.get_height_at(hit_pos) + 1.0

    var radius: float = randf_range(explosion_radius_min, explosion_radius_max)

    if terrain_world:
        var volume_before: double = 0.0
        if volume_tracker:
            volume_before = terrain_world.get_height_at(hit_pos)

        terrain_world.apply_deformation(hit_pos, radius, explosion_depth, is_additive)

        if volume_tracker:
            var volume_after: double = terrain_world.get_height_at(hit_pos)
            var volume_change: double = (volume_after - volume_before) * radius * radius * 3.14159
            var operation: String = "ADD" if is_additive else "REMOVE"
            volume_tracker.record_explosion(hit_pos, radius, volume_change, operation)

    print("[Explosion] 位置: (%.1f, %.1f, %.1f) | 半径: %.1f | %s" % [
        hit_pos.x, hit_pos.y, hit_pos.z,
        radius,
        "添加" if is_additive else "移除"
    ])

func _raycast_terrain(origin: Vector3, direction: Vector3) -> Vector3:
    var step: float = 0.5
    var max_distance: float = 500.0
    var current_pos: Vector3 = origin

    for i in range(int(max_distance / step)):
        current_pos += direction * step
        if terrain_world:
            var terrain_height: float = terrain_world.get_height_at(current_pos)
            if current_pos.y <= terrain_height:
                return Vector3(current_pos.x, terrain_height, current_pos.z)

    return Vector3.ZERO

func _reset_terrain() -> void:
    if terrain_world:
        terrain_world.reset_world()
    if volume_tracker:
        volume_tracker.reset()
    print("[System] 地形已重置")

func _run_stress_test(count: int) -> void:
    print("\n=== 压力测试开始: ", count, " 次爆炸 ===")

    for i in range(count):
        var pos: Vector3 = Vector3(
            randf_range(-300, 300),
            50,
            randf_range(-300, 300)
        )
        var is_additive: bool = randf() > 0.5
        var radius: float = randf_range(5.0, 20.0)

        if terrain_world:
            terrain_world.apply_deformation(pos, radius, explosion_depth, is_additive)

        if volume_tracker:
            var operation: String = "ADD" if is_additive else "REMOVE"
            volume_tracker.record_explosion(pos, radius, is_additive ? 50 : -50, operation)

        if i % 10 == 9:
            print("已完成 ", i + 1, "/", count, " 次爆炸")
            await get_tree().process_frame

    print("=== 压力测试完成 ===")

func _toggle_streaming() -> void:
    if terrain_world:
        terrain_world.set_streaming_enabled(not terrain_world.get_streaming_enabled())
        print("[System] 流式加载: ", terrain_world.get_streaming_enabled() ? "开启" : "关闭")
