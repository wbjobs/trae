#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

bool init_engine();
void destroy_engine();

bool load_mbtiles(const char* path);
void set_viewport_size(uint32_t width, uint32_t height);
void render_frame();
void update_simulation();

void set_map_center(double latitude, double longitude);
double get_map_center_latitude();
double get_map_center_longitude();

void set_zoom(float zoom);
float get_zoom();
void zoom_by(float delta);

void set_rotation(float rotation);
float get_rotation();
void rotate_by(float delta);

void set_tilt(float tilt);
float get_tilt();
void tilt_by(float delta);

void pan_by(double dx, double dy);
void reset_view();

void set_gps_position(double latitude, double longitude);
double get_gps_latitude();
double get_gps_longitude();
float get_gps_heading();
float get_gps_speed();
void set_gps_speed(float speed);

void start_gps_simulation();
void stop_gps_simulation();
bool is_gps_active();

bool plan_route(double start_lat, double start_lon, double end_lat, double end_lon);
double get_route_distance();
double get_route_duration();
void clear_route();

uint32_t get_route_point_count();
double get_route_point_latitude(uint32_t index);
double get_route_point_longitude(uint32_t index);

double screen_to_geo_latitude(float screen_x, float screen_y);
double screen_to_geo_longitude(float screen_x, float screen_y);

float get_min_zoom();
float get_max_zoom();
float get_min_tilt();
float get_max_tilt();

#ifdef __cplusplus
}
#endif
