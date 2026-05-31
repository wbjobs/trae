shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

// Terrain textures
uniform sampler2D grass_texture : repeat_enable;
uniform sampler2D rock_texture : repeat_enable;
uniform sampler2D snow_texture : repeat_enable;
uniform sampler2D sand_texture : repeat_enable;

// Terrain normal maps
uniform sampler2D grass_normal : repeat_enable;
uniform sampler2D rock_normal : repeat_enable;
uniform sampler2D snow_normal : repeat_enable;
uniform sampler2D sand_normal : repeat_enable;

// Weight map (R=grass, G=rock, B=snow, A=sand)
uniform sampler2D weightmap_texture;

// Height map
uniform sampler2D heightmap_texture;

// Normal map
uniform sampler2D normalmap_texture;

// Terrain parameters
uniform float terrain_scale = 1.0;
uniform float texture_scale = 50.0;
uniform float height_scale = 100.0;
uniform float normal_strength = 1.0;

// PBR parameters
uniform float metallic : hint_range(0.0, 1.0) = 0.0;
uniform float roughness : hint_range(0.0, 1.0) = 0.8;

void vertex() {
    vec2 uv = UV * texture_scale;

    float height = texture(heightmap_texture, UV).r;
    VERTEX.y = height * height_scale;

    NORMAL = texture(normalmap_texture, UV).xyz;
    NORMAL = normalize(NORMAL);

    UV2 = UV;
}

void fragment() {
    vec2 uv = UV * texture_scale;
    vec4 weights = texture(weightmap_texture, UV);

    float grass_weight = weights.r;
    float rock_weight = weights.g;
    float snow_weight = weights.b;
    float sand_weight = weights.a;

    float total_weight = grass_weight + rock_weight + snow_weight + sand_weight;
    if (total_weight > 0.001) {
        grass_weight /= total_weight;
        rock_weight /= total_weight;
        snow_weight /= total_weight;
        sand_weight /= total_weight;
    }

    vec4 grass_color = texture(grass_texture, uv);
    vec4 rock_color = texture(rock_texture, uv);
    vec4 snow_color = texture(snow_texture, uv);
    vec4 sand_color = texture(sand_texture, uv);

    vec3 albedo = grass_color.rgb * grass_weight
                + rock_color.rgb * rock_weight
                + snow_color.rgb * snow_weight
                + sand_color.rgb * sand_weight;

    vec3 grass_nrm = texture(grass_normal, uv).xyz * 2.0 - 1.0;
    vec3 rock_nrm = texture(rock_normal, uv).xyz * 2.0 - 1.0;
    vec3 snow_nrm = texture(snow_normal, uv).xyz * 2.0 - 1.0;
    vec3 sand_nrm = texture(sand_normal, uv).xyz * 2.0 - 1.0;

    vec3 detail_normal = grass_nrm * grass_weight
                       + rock_nrm * rock_weight
                       + snow_nrm * snow_weight
                       + sand_nrm * sand_weight;

    vec3 terrain_normal = normalize(texture(normalmap_texture, UV).xyz);

    NORMAL_MAP = mix(NORMAL, detail_normal, normal_strength);
    NORMAL_MAP_DEPTH = normal_strength;

    ALBEDO = albedo;
    METALLIC = metallic;
    ROUGHNESS = roughness;

    float slope = 1.0 - terrain_normal.y;
    ROUGHNESS = mix(roughness, roughness * 0.5, rock_weight * slope);
}
