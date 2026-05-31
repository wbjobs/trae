[compute]

// Terrain Deformation Compute Shader
// Work group size: 16x16 = 256 threads
layout(local_size_x = 16, local_size_y = 16) in;

// Heightmap texture - store heights in R channel
uniform sampler2D heightmap_texture;

// Output heightmap image - RW texture for compute
uniform image2D heightmap_output;

// Deformation parameters
uniform vec3 deformation_center;  // World space center
uniform float deformation_radius; // World space radius
uniform float deformation_depth;  // Maximum deformation depth
uniform int is_additive;          // 1 = add terrain, 0 = remove
uniform float terrain_scale;      // World units per heightmap pixel
uniform int terrain_size;         // Heightmap resolution

void main() {
    ivec2 pixel_coords = ivec2(gl_GlobalInvocationID.xy);

    if (pixel_coords.x >= terrain_size || pixel_coords.y >= terrain_size) {
        return;
    }

    float half_size = float(terrain_size) * 0.5;
    vec2 world_pos = (vec2(pixel_coords) - vec2(half_size)) * terrain_scale;

    vec2 offset = world_pos - deformation_center.xz;
    float dist_sq = dot(offset, offset);
    float radius_sq = deformation_radius * deformation_radius;

    if (dist_sq < radius_sq) {
        float dist = sqrt(dist_sq);
        float normalized_dist = dist / deformation_radius;

        float falloff = 1.0 - normalized_dist;
        falloff = falloff * falloff * (3.0 - 2.0 * falloff);

        float deformation = deformation_depth * falloff;

        vec4 current_val = texelFetch(heightmap_texture, pixel_coords, 0);
        float current_height = current_val.r;

        float new_height;
        if (is_additive == 1) {
            new_height = current_height + deformation;
        } else {
            new_height = current_height - deformation;
        }

        imageStore(heightmap_output, pixel_coords, vec4(new_height, 0.0, 0.0, 1.0));
    } else {
        vec4 current_val = texelFetch(heightmap_texture, pixel_coords, 0);
        imageStore(heightmap_output, pixel_coords, current_val);
    }
}
