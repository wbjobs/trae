shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

uniform sampler2D weightmap_texture;
uniform sampler2D normalmap_texture;
uniform float terrain_size = 1024.0;

uniform vec3 grass_color : source_color = vec3(0.2, 0.5, 0.2);
uniform vec3 rock_color : source_color = vec3(0.4, 0.4, 0.4);
uniform vec3 snow_color : source_color = vec3(0.95, 0.95, 0.95);
uniform vec3 sand_color : source_color = vec3(0.85, 0.8, 0.6);

uniform float roughness : hint_range(0.0, 1.0) = 0.7;

void fragment() {
    vec4 weights = texture(weightmap_texture, UV);

    float grass_weight = weights.r;
    float rock_weight = weights.g;
    float snow_weight = weights.b;
    float sand_weight = weights.a;

    vec3 blended_color = grass_color * grass_weight
                       + rock_color * rock_weight
                       + snow_color * snow_weight
                       + sand_color * sand_weight;

    ALBEDO = blended_color;
    ROUGHNESS = roughness;
    METALLIC = 0.0;

    vec3 terrain_normal = normalize(texture(normalmap_texture, UV).xyz);
    NORMAL = terrain_normal;
}
