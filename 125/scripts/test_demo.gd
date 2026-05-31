extends Node3D

@export var terrain_data_resource: TerrainData

var terrain_data: TerrainData
var terrain_mesh: TerrainMesh
var volume_tracker: VolumeTracker

var explosive_scene: PackedScene

var explosion_count: int = 0
var max_explosions: int = 100

func _ready() -> void:
    _setup_terrain()
    _setup_explosives()
    _print_instructions()

func _setup_terrain() -> void:
    terrain_data = TerrainData.new()
    terrain_data.initialize(1.0, 0.0, 100.0)
    terrain_data.generate_perlin_terrain(12345, 4.0, 6, 0.5)

    volume_tracker = VolumeTracker.new()

    terrain_mesh = TerrainMesh.new()
    add_child(terrain_mesh)
    terrain_mesh.setup_terrain(terrain_data)

func _setup_explosives() -> void:
    explosive_scene = preload("res://scenes/explosive.tscn")

func _unhandled_input(event: InputEvent) -> void:
    if event is InputEventKey and event.pressed:
        if event.keycode == KEY_SPACE:
            _trigger_random_explosion()
        elif event.keycode == KEY_R:
            _reset_terrain()
        elif event.keycode == KEY_1:
            _run_stress_test(10)
        elif event.keycode == KEY_2:
            _run_stress_test(100)

func _trigger_random_explosion() -> void:
    var pos: Vector3 = Vector3(
        randf_range(-200, 200),
        50,
        randf_range(-200, 200)
    )

    var is_additive: bool = randf() > 0.5

    _create_explosion(
        pos,
        randf_range(5.0, 20.0),
        randf_range(1.0, 5.0),
        is_additive
    )

func _create_explosion(pos: Vector3, radius: float, depth: float, is_additive: bool) -> void:
    var explosive: Explosive = explosive_scene.instantiate()
    explosive.global_position = pos
    explosive.set_explosion_radius(radius)
    explosive.set_explosion_depth(depth)
    explosive.set_is_additive(is_additive)
    explosive.set_terrain_data(terrain_data)
    explosive.set_volume_tracker(volume_tracker)
    add_child(explosive)

    await get_tree().create_timer(0.05).timeout
    explosive.explode()

    terrain_mesh.update_from_data()

    explosion_count += 1
    print("爆炸 #%d | 位置: (%.1f, %.1f, %.1f) | 半径: %.1f | %s" % [
        explosion_count,
        pos.x, pos.y, pos.z,
        radius,
        "添加" if is_additive else "移除"
    ])

func _reset_terrain() -> void:
    terrain_data.reset_to_original()
    terrain_mesh.update_from_data()
    volume_tracker.reset()
    explosion_count = 0
    print("\n=== 地形已重置 ===")
    print(volume_tracker.get_summary())

func _run_stress_test(count: int) -> void:
    print("\n=== 开始压力测试: %d 次爆炸 ===" % count)
    explosion_count = 0

    for i in range(count):
        var pos: Vector3 = Vector3(
            randf_range(-300, 300),
            50,
            randf_range(-300, 300)
        )
        var is_additive: bool = randf() > 0.5
        var radius: float = randf_range(5.0, 20.0)
        var depth: float = randf_range(1.0, 4.0)

        terrain_data.apply_deformation(pos, radius, depth, is_additive)
        explosion_count += 1

        if i % 10 == 9:
            print("已完成 %d/%d 次爆炸..." % [i + 1, count])

    terrain_mesh.update_from_data()
    print("\n=== 压力测试完成 ===")
    print(volume_tracker.get_summary())

func _print_instructions() -> void:
    print("========================================")
    print("  动态地形破坏系统 - 测试场景")
    print("========================================")
    print()
    print("控制说明:")
    print("  空格键 - 触发随机爆炸")
    print("  R键    - 重置地形")
    print("  1键    - 10次爆炸压力测试")
    print("  2键    - 100次爆炸压力测试")
    print()
    print("爆炸类型:")
    print("  - 移除模式: 创建弹坑")
    print("  - 添加模式: 创建土堆")
    print()
    print("系统功能:")
    print("  - 1024x1024 高度图地形")
    print("  - 实时地形变形（半径5-20米）")
    print("  - 基于高度和坡度的纹理混合")
    print("  - 体积变化追踪")
    print()
    print("修复内容:")
    print("  ✓ 距离计算修复: 只在 XZ 平面计算")
    print("  ✓ 法线计算改进: Sobel 算子 8 邻域")
    print("  ✓ 添加平滑处理: 防止尖刺和孔洞")
    print("  ✓ 区域更新优化: 只更新受影响区域")
    print()
