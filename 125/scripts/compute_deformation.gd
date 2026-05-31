extends RefCounted
class_name ComputeDeformation

var rendering_device: RenderingDevice
var compute_pipeline: RID
var shader_file: Shader

var heightmap_buffer: RID
var deformation_params_buffer: RID

var uniform_set: RID

var is_initialized: bool = false

const WORK_GROUP_SIZE = 16

func init() -> bool:
    rendering_device = RenderingServer.create_local_rendering_device()
    if not rendering_device:
        return false

    shader_file = load("res://shaders/terrain_deformation.glsl")
    if not shader_file:
        return false

    var shader_variants: Array = []
    shader_variants.append(RenderingDevice.SHADER_STAGE_COMPUTE)

    var shader: RID = rendering_device.shader_create_from_bytecode(
        shader_file.get_spirv(RenderingDevice.SHADER_STAGE_COMPUTE)
    )

    compute_pipeline = rendering_device.compute_pipeline_create(shader)

    if not rendering_device.compute_pipeline_is_valid(compute_pipeline):
        return false

    is_initialized = true
    return true

func create_heightmap_buffer(size: int, data: PackedFloat32Array) -> void:
    if not is_initialized:
        return

    if heightmap_buffer.is_valid():
        rendering_device.free_buffer(heightmap_buffer)

    heightmap_buffer = rendering_device.storage_buffer_create(
        size * 4,
        RenderingDevice.BUFFER_USAGE_STORAGE_BIT | RenderingDevice.BUFFER_USAGE_TRANSFER_DST_BIT,
        data.to_byte_array()
    )

func create_deformation_params(center: Vector3, radius: float, depth: float, is_additive: bool) -> void:
    if not is_initialized:
        return

    if deformation_params_buffer.is_valid():
        rendering_device.free_buffer(deformation_params_buffer)

    var params: PackedFloat32Array = []
    params.append(center.x)
    params.append(center.z)
    params.append(radius)
    params.append(depth)
    params.append(1.0 if is_additive else 0.0)
    params.append(0.0)
    params.append(0.0)
    params.append(0.0)

    deformation_params_buffer = rendering_device.storage_buffer_create(
        8 * 4,
        RenderingDevice.BUFFER_USAGE_UNIFORM_BUFFER_BIT,
        params.to_byte_array()
    )

func run_deformation(terrain_size: int) -> void:
    if not is_initialized:
        return

    var work_groups_x: int = (terrain_size + WORK_GROUP_SIZE - 1) / WORK_GROUP_SIZE
    var work_groups_y: int = (terrain_size + WORK_GROUP_SIZE - 1) / WORK_GROUP_SIZE

    rendering_device.compute_begin(compute_pipeline, work_groups_x, work_groups_y, 1)
    rendering_device.compute_end()

func read_back_heightmap(size: int) -> PackedFloat32Array:
    if not is_initialized or not heightmap_buffer.is_valid():
        return PackedFloat32Array()

    var data: PackedByteArray = rendering_device.buffer_get_data(heightmap_buffer)
    return PackedFloat32Array(data)

func cleanup() -> void:
    if not is_initialized:
        return

    if uniform_set.is_valid():
        rendering_device.free_descriptor_set(uniform_set)

    if heightmap_buffer.is_valid():
        rendering_device.free_buffer(heightmap_buffer)

    if deformation_params_buffer.is_valid():
        rendering_device.free_buffer(deformation_params_buffer)

    if compute_pipeline.is_valid():
        rendering_device.free_pipeline(compute_pipeline)

    is_initialized = false
