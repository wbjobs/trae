extends Node3D

@export var explosion_radius: float = 10.0
@export var explosion_depth: float = 2.0
@export var is_additive: bool = false
@export var fuse_time: float = 0.0

@export var terrain_data: TerrainData
@export var volume_tracker: VolumeTracker

var exploded: bool = false

func _ready() -> void:
    if fuse_time > 0.0:
        var timer: SceneTreeTimer = get_tree().create_timer(fuse_time)
        timer.timeout.connect(_on_fuse_timeout)

func _on_fuse_timeout() -> void:
    explode()

func explode() -> void:
    if exploded:
        return

    exploded = true

    if terrain_data:
        var volume_before: double = 0.0
        if volume_tracker:
            volume_before = terrain_data.calculate_volume_in_region(global_position, explosion_radius)

        terrain_data.apply_deformation(global_position, explosion_radius, explosion_depth, is_additive)

        if volume_tracker:
            var volume_after: double = terrain_data.calculate_volume_in_region(global_position, explosion_radius)
            var volume_change: double = volume_after - volume_before
            var operation: String = "ADD" if is_additive else "REMOVE"

            volume_tracker.record_explosion(global_position, explosion_radius, volume_change, operation)

            print("[Explosive] 爆炸位置: ", global_position,
                  " | 半径: ", explosion_radius,
                  " | 体积变化: ", volume_change, " m³",
                  " | 操作: ", operation)

    var mesh_instance: MeshInstance3D = get_node_or_null("MeshInstance3D") as MeshInstance3D
    if mesh_instance:
        mesh_instance.queue_free()

    queue_free()
