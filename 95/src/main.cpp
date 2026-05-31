#include <iostream>
#include <chrono>
#include <SDL.h>
#include "utils.h"
#include "hittable_list.h"
#include "sphere.h"
#include "bvh.h"
#include "camera.h"
#include "renderer.h"
#include "material.h"
#include "thread_pool.h"

const int IMAGE_WIDTH = 800;
const int IMAGE_HEIGHT = 600;
const int SAMPLES_PER_PIXEL = 4;
const int MAX_DEPTH = 30;

int main(int argc, char* argv[]) {
    if (SDL_Init(SDL_INIT_VIDEO) < 0) {
        std::cerr << "SDL could not initialize! SDL_Error: " << SDL_GetError() << std::endl;
        return 1;
    }

    SDL_Window* window = SDL_CreateWindow(
        "Real-time Ray Tracing",
        SDL_WINDOWPOS_UNDEFINED, SDL_WINDOWPOS_UNDEFINED,
        IMAGE_WIDTH, IMAGE_HEIGHT,
        SDL_WINDOW_SHOWN
    );

    if (!window) {
        std::cerr << "Window could not be created! SDL_Error: " << SDL_GetError() << std::endl;
        SDL_Quit();
        return 1;
    }

    SDL_Renderer* renderer = SDL_CreateRenderer(window, -1, SDL_RENDERER_ACCELERATED);
    if (!renderer) {
        std::cerr << "Renderer could not be created! SDL_Error: " << SDL_GetError() << std::endl;
        SDL_DestroyWindow(window);
        SDL_Quit();
        return 1;
    }

    SDL_Texture* texture = SDL_CreateTexture(
        renderer,
        SDL_PIXELFORMAT_ARGB8888,
        SDL_TEXTUREACCESS_STREAMING,
        IMAGE_WIDTH, IMAGE_HEIGHT
    );

    if (!texture) {
        std::cerr << "Texture could not be created! SDL_Error: " << SDL_GetError() << std::endl;
        SDL_DestroyRenderer(renderer);
        SDL_DestroyWindow(window);
        SDL_Quit();
        return 1;
    }

    hittable_list world;

    auto material_ground = make_shared<lambertian>(color(0.8, 0.8, 0.0));
    auto material_center = make_shared<lambertian>(color(0.7, 0.3, 0.3));
    auto material_left = make_shared<dielectric>(1.5);
    auto material_right = make_shared<metal>(color(0.8, 0.6, 0.2), 0.0);

    world.add(make_shared<sphere>(point3(0.0, -100.5, -1.0), 100.0, material_ground));
    world.add(make_shared<sphere>(point3(0.0, 0.0, -1.0), 0.5, material_center));
    world.add(make_shared<sphere>(point3(-1.0, 0.0, -1.0), 0.5, material_left));
    world.add(make_shared<sphere>(point3(1.0, 0.0, -1.0), 0.5, material_right));

    bvh_node world_bvh(world.objects, 0, world.objects.size(), 0, 1);

    point3 lookfrom(0, 0, 1);
    point3 lookat(0, 0, -1);
    vec3 vup(0, 1, 0);
    auto dist_to_focus = (lookfrom - lookat).length();
    auto vfov = 60.0;
    auto aspect_ratio = static_cast<double>(IMAGE_WIDTH) / IMAGE_HEIGHT;

    camera cam(lookfrom, lookat, vup, vfov, aspect_ratio);

    thread_pool pool(4);

    bool running = true;
    SDL_Event event;
    bool mouse_dragging = false;
    int last_mouse_x = 0, last_mouse_y = 0;

    auto last_time = std::chrono::high_resolution_clock::now();
    int frame_count = 0;
    double fps = 0.0;
    double frame_time_ms = 0.0;

    while (running) {
        auto frame_start = std::chrono::high_resolution_clock::now();

        while (SDL_PollEvent(&event)) {
            if (event.type == SDL_QUIT) {
                running = false;
            } else if (event.type == SDL_MOUSEBUTTONDOWN) {
                if (event.button.button == SDL_BUTTON_LEFT) {
                    mouse_dragging = true;
                    last_mouse_x = event.button.x;
                    last_mouse_y = event.button.y;
                }
            } else if (event.type == SDL_MOUSEBUTTONUP) {
                if (event.button.button == SDL_BUTTON_LEFT) {
                    mouse_dragging = false;
                }
            } else if (event.type == SDL_MOUSEMOTION) {
                if (mouse_dragging) {
                    int delta_x = event.motion.x - last_mouse_x;
                    int delta_y = event.motion.y - last_mouse_y;
                    cam.rotate(delta_x * 0.5, -delta_y * 0.5, lookat, vup, vfov, aspect_ratio);
                    last_mouse_x = event.motion.x;
                    last_mouse_y = event.motion.y;
                }
            }
        }

        render_frame(texture, world_bvh, cam, IMAGE_WIDTH, IMAGE_HEIGHT, SAMPLES_PER_PIXEL, MAX_DEPTH, pool);

        SDL_RenderClear(renderer);
        SDL_RenderCopy(renderer, texture, nullptr, nullptr);
        SDL_RenderPresent(renderer);

        auto frame_end = std::chrono::high_resolution_clock::now();
        std::chrono::duration<double, std::milli> frame_duration = frame_end - frame_start;
        frame_time_ms = frame_duration.count();

        frame_count++;
        auto current_time = std::chrono::high_resolution_clock::now();
        std::chrono::duration<double> elapsed = current_time - last_time;
        if (elapsed.count() >= 1.0) {
            fps = frame_count / elapsed.count();
            frame_count = 0;
            last_time = current_time;
            std::cout << "FPS: " << fps << " | Frame Time: " << frame_time_ms << " ms" << std::endl;
        }
    }

    SDL_DestroyTexture(texture);
    SDL_DestroyRenderer(renderer);
    SDL_DestroyWindow(window);
    SDL_Quit();

    return 0;
}
