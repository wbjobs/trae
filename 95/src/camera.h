#ifndef CAMERA_H
#define CAMERA_H

#include "utils.h"
#include <cmath>

class camera {
public:
    camera(point3 lookfrom, point3 lookat, vec3 vup, double vfov, double aspect_ratio) {
        update(lookfrom, lookat, vup, vfov, aspect_ratio);
    }

    void update(point3 lookfrom, point3 lookat, vec3 vup, double vfov, double aspect_ratio) {
        auto theta = degrees_to_radians(vfov);
        auto h = tan(theta / 2);
        auto viewport_height = 2.0 * h;
        auto viewport_width = aspect_ratio * viewport_height;

        w = unit_vector(lookfrom - lookat);
        u = unit_vector(cross(vup, w));
        v = cross(w, u);

        origin = lookfrom;
        horizontal = viewport_width * u;
        vertical = viewport_height * v;
        lower_left_corner = origin - horizontal / 2 - vertical / 2 - w;
    }

    ray get_ray(double s, double t) const {
        return ray(origin, lower_left_corner + s * horizontal + t * vertical - origin);
    }

    void rotate(double delta_yaw, double delta_pitch, point3 lookat, vec3 vup, double vfov, double aspect_ratio) {
        yaw += delta_yaw;
        pitch += delta_pitch;
        pitch = clamp(pitch, -89.0, 89.0);

        double radius = (origin - lookat).length();
        double yaw_rad = degrees_to_radians(yaw);
        double pitch_rad = degrees_to_radians(pitch);

        point3 new_lookfrom(
            lookat.x() + radius * cos(pitch_rad) * sin(yaw_rad),
            lookat.y() + radius * sin(pitch_rad),
            lookat.z() + radius * cos(pitch_rad) * cos(yaw_rad)
        );

        update(new_lookfrom, lookat, vup, vfov, aspect_ratio);
    }

    void set_position(const point3& pos, point3 lookat, vec3 vup, double vfov, double aspect_ratio) {
        origin = pos;
        update(pos, lookat, vup, vfov, aspect_ratio);
    }

    point3 origin;
    vec3 u, v, w;

private:
    point3 lower_left_corner;
    vec3 horizontal;
    vec3 vertical;

    double yaw = -90.0;
    double pitch = 0.0;
};

#endif
