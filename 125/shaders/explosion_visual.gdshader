shader_type spatial;
render_mode unshaded, blend_add, depth_draw_always, cull_disabled;

uniform vec4 explosion_color : source_color = vec4(1.0, 0.5, 0.0, 0.3);
uniform float explosion_radius = 10.0;
uniform float time = 0.0;
uniform float pulse_speed = 2.0;

void vertex() {
    float pulse = 1.0 + 0.1 * sin(time * pulse_speed);
    VERTEX *= pulse;
}

void fragment() {
    float dist = length(VERTEX.xz);
    float fade = 1.0 - smoothstep(0.0, explosion_radius, dist);
    float pulse = 0.5 + 0.5 * sin(time * pulse_speed * 2.0);

    ALBEDO = explosion_color.rgb;
    ALPHA = explosion_color.a * fade * (0.7 + 0.3 * pulse);
    EMISSION = explosion_color.rgb * fade * pulse;
}
