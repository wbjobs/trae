#ifndef RENDERER_H
#define RENDERER_H

#include "utils.h"
#include "hittable.h"
#include "camera.h"
#include "color.h"
#include "thread_pool.h"
#include <vector>
#include <future>
#include <SDL.h>

const int TILE_SIZE_X = 4;
const int TILE_SIZE_Y = 4;

color ray_color(const ray& r, const hittable& world, int depth) {
    hit_record rec;

    if (world.hit(r, 0.001, infinity, rec)) {
        ray scattered;
        color attenuation;
        if (depth <= 0) {
            vec3 unit_direction = unit_vector(r.direction());
            auto t = 0.5 * (unit_direction.y() + 1.0);
            return (1.0 - t) * color(1.0, 1.0, 1.0) + t * color(0.5, 0.7, 1.0);
        }
        if (rec.mat_ptr->scatter(r, rec, attenuation, scattered))
            return attenuation * ray_color(scattered, world, depth - 1);
        return color(0, 0, 0);
    }

    vec3 unit_direction = unit_vector(r.direction());
    auto t = 0.5 * (unit_direction.y() + 1.0);
    return (1.0 - t) * color(1.0, 1.0, 1.0) + t * color(0.5, 0.7, 1.0);
}

void render_tile(int start_x, int start_y, int end_x, int end_y,
                 Uint32* pixel_data, int image_width, int image_height,
                 const hittable& world, camera& cam,
                 int samples_per_pixel, int max_depth) {
    for (int j = start_y; j < end_y; ++j) {
        for (int i = start_x; i < end_x; ++i) {
            color pixel_color(0, 0, 0);
            for (int s = 0; s < samples_per_pixel; ++s) {
                auto u = (i + random_double()) / (image_width - 1);
                auto v = (j + random_double()) / (image_height - 1);
                ray r = cam.get_ray(u, 1.0 - v);
                pixel_color += ray_color(r, world, max_depth);
            }
            pixel_data[j * image_width + i] = color_to_uint32(pixel_color, samples_per_pixel);
        }
    }
}

void render_frame(SDL_Texture* texture, const hittable& world, camera& cam,
                  int image_width, int image_height, int samples_per_pixel, int max_depth,
                  thread_pool& pool) {
    void* pixels;
    int pitch;
    SDL_LockTexture(texture, nullptr, &pixels, &pitch);
    Uint32* pixel_data = static_cast<Uint32*>(pixels);

    std::vector<std::future<void>> futures;

    int tile_width = (image_width + TILE_SIZE_X - 1) / TILE_SIZE_X;
    int tile_height = (image_height + TILE_SIZE_Y - 1) / TILE_SIZE_Y;

    for (int ty = 0; ty < TILE_SIZE_Y; ++ty) {
        for (int tx = 0; tx < TILE_SIZE_X; ++tx) {
            int start_x = tx * tile_width;
            int start_y = ty * tile_height;
            int end_x = std::min(start_x + tile_width, image_width);
            int end_y = std::min(start_y + tile_height, image_height);

            futures.emplace_back(
                pool.enqueue(render_tile, start_x, start_y, end_x, end_y,
                             pixel_data, image_width, image_height,
                             std::cref(world), std::ref(cam),
                             samples_per_pixel, max_depth)
            );
        }
    }

    for (auto& f : futures) {
        f.get();
    }

    SDL_UnlockTexture(texture);
}

#endif
