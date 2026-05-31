#ifndef COLOR_H
#define COLOR_H

#include "vec3.h"
#include <iostream>
#include <SDL.h>

inline Uint32 color_to_uint32(const color& pixel_color, int samples_per_pixel) {
    auto r = pixel_color.x();
    auto g = pixel_color.y();
    auto b = pixel_color.z();

    auto scale = 1.0 / samples_per_pixel;
    r = sqrt(scale * r);
    g = sqrt(scale * g);
    b = sqrt(scale * b);

    Uint8 ir = static_cast<Uint8>(256 * std::clamp(r, 0.0, 0.999));
    Uint8 ig = static_cast<Uint8>(256 * std::clamp(g, 0.0, 0.999));
    Uint8 ib = static_cast<Uint8>(256 * std::clamp(b, 0.0, 0.999));

    return (0xFF << 24) | (ir << 16) | (ig << 8) | ib;
}

#endif
