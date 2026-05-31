extends Node3D

@export var terrain_data: TerrainData
@export var terrain_scale: float = 1.0
@export var min_height: float = 0.0
@export var max_height: float = 100.0
@export var terrain_seed: int = 42
@export var noise_frequency: float = 4.0
@export var noise_octaves: int = 6
@export var noise_persistence: float = 0.5

var terrain_mesh: MeshInstance3D
var shader_material: ShaderMaterial

func _ready() -> void:
    _setup_terrain_data()
    _create_terrain_mesh()
    _setup_shader()

func _setup_terrain_data() -> void:
    if not terrain_data:
        terrain_data = TerrainData.new()
        terrain_data.initialize(terrain_scale, min_height, max_height)
        terrain_data.generate_perlin_terrain(
            terrain_seed,
            noise_frequency,
            noise_octaves,
            noise_persistence
        )

func _create_terrain_mesh() -> void:
    terrain_mesh = MeshInstance3D.new()
    add_child(terrain_mesh)

    var mesh: ArrayMesh = ArrayMesh.new()
    var size: int = terrain_data.get_terrain_size()

    var vertices: PackedVector3Array = []
    var normals: PackedVector3Array = []
    var uvs: PackedVector2Array = []
    var indices: PackedInt32Array = []

    for z in range(size):
        for x in range(size):
            var pos: Vector3 = terrain_data.get_world_position(x, z)
            vertices.append(pos)

            var normal: Vector3 = terrain_data.get_normal(x, z)
            normals.append(normal)

            uvs.append(Vector2(float(x) / (size - 1), float(z) / (size - 1)))

    for z in range(size - 1):
        for x in range(size - 1):
            var i0: int = z * size + x
            var i1: int = i0 + 1
            var i2: int = i0 + size
            var i3: int = i2 + 1

            indices.append(i0)
            indices.append(i2)
            indices.append(i1)

            indices.append(i1)
            indices.append(i2)
            indices.append(i3)

    var arrays: Array = []
    arrays.resize(Mesh.ARRAY_MAX)
    arrays[Mesh.ARRAY_VERTEX] = vertices
    arrays[Mesh.ARRAY_NORMAL] = normals
    arrays[Mesh.ARRAY_TEX_UV] = uvs
    arrays[Mesh.ARRAY_INDEX] = indices

    mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
    terrain_mesh.mesh = mesh

func _setup_shader() -> void:
    var shader: Shader = preload("res://shaders/terrain_simple.gdshader")
    shader_material = ShaderMaterial.new()
    shader_material.shader = shader
    terrain_mesh.material_override = shader_material

    _update_shader_parameters()

func _update_shader_parameters() -> void:
    if shader_material and terrain_data:
        var heightmap_img: Image = _create_heightmap_image()
        var normalmap_img: Image = _create_normalmap_image()
        var weightmap_img: Image = _create_weightmap_image()

        shader_material.set_shader_parameter("weightmap_texture", ImageTexture.create_from_image(weightmap_img))
        shader_material.set_shader_parameter("normalmap_texture", ImageTexture.create_from_image(normalmap_img))

func _create_heightmap_image() -> Image:
    var size: int = terrain_data.get_terrain_size()
    var img: Image = Image.create(size, size, false, Image.FORMAT_R32F)

    for z in range(size):
        for x in range(size):
            var height: float = terrain_data.get_height(x, z)
            img.set_pixel(x, z, Color(height, 0, 0, 1))

    return img

func _create_normalmap_image() -> Image:
    var size: int = terrain_data.get_terrain_size()
    var img: Image = Image.create(size, size, false, Image.FORMAT_RGBA8)

    for z in range(size):
        for x in range(size):
            var normal: Vector3 = terrain_data.get_normal(x, z)
            img.set_pixel(x, z, Color(
                (normal.x + 1.0) * 0.5,
                (normal.y + 1.0) * 0.5,
                (normal.z + 1.0) * 0.5,
                1.0
            ))

    return img

func _create_weightmap_image() -> Image:
    var size: int = terrain_data.get_terrain_size()
    var img: Image = Image.create(size, size, false, Image.FORMAT_RGBA8)

    for z in range(size):
        for x in range(size):
            var weight: Color = terrain_data.get_weight(x, z)
            img.set_pixel(x, z, weight)

    return img

func update_terrain() -> void:
    terrain_data.update_normals()
    terrain_data.update_slopes()
    terrain_data.update_weight_map()

    _create_terrain_mesh()
    _update_shader_parameters()
