#ifndef WEATHER_FFT_H
#define WEATHER_FFT_H

#include <mpi.h>
#include <fftw3.h>

#define MAX_FILENAME 256
#define MAX_LOAD_SAMPLES 100

typedef struct {
    int nx, ny, nz;
    int px, py;
    int rank, size;
    int coords[2];

    int local_nx, local_ny;
    int local_x_start, local_y_start;

    MPI_Comm cart_comm;
    MPI_Comm row_comm;
    MPI_Comm col_comm;

    int *sendcounts_x, *senddispls_x;
    int *recvcounts_x, *recvdispls_x;
    int *sendcounts_z, *senddispls_z;
    int *recvcounts_z, *recvdispls_z;

    double *transpose_buf;
    long transpose_buf_size;
} Domain;

typedef struct {
    double *u, *v, *w;
    double *temperature;

    fftw_complex *u_hat, *v_hat, *w_hat;
    fftw_complex *temp_hat;

    fftw_plan plan_forward_u_xy, plan_backward_u_xy;
    fftw_plan plan_forward_v_xy, plan_backward_v_xy;
    fftw_plan plan_forward_w_xy, plan_backward_w_xy;
    fftw_plan plan_forward_t_xy, plan_backward_t_xy;

    fftw_plan plan_forward_u_z, plan_backward_u_z;
    fftw_plan plan_forward_v_z, plan_backward_v_z;
    fftw_plan plan_forward_w_z, plan_backward_w_z;
    fftw_plan plan_forward_t_z, plan_backward_t_z;
} Field;

typedef struct {
    char output_file[MAX_FILENAME];
    int nx, ny, nz;
    int num_steps;
    double dt;
    double viscosity;
    double thermal_diffusivity;

    int load_balance_interval;
    int use_load_balancing;
    double load_imbalance_threshold;
} Config;

typedef struct {
    double local_work;
    double *all_works;
    double imbalance_ratio;
    int needs_rebalancing;

    double compute_times[MAX_LOAD_SAMPLES];
    double communication_times[MAX_LOAD_SAMPLES];
    int sample_count;
} LoadProfile;

typedef struct {
    int *rank_assignments;
    int *partition_starts;
    int *partition_sizes;
    int num_partitions;
    double *partition_weights;
} LoadBalancePlan;

void domain_init(Domain *d, int nx, int ny, int nz, MPI_Comm comm);
void domain_free(Domain *d);
void domain_print_info(const Domain *d);

void transpose_xy_to_z(Field *f, const Domain *d);
void transpose_z_to_xy(Field *f, const Domain *d);

void field_init(Field *f, const Domain *d);
void field_free(Field *f, const Domain *d);
void field_initialize_conditions(Field *f, const Domain *d);

void fft_forward(Field *f, const Domain *d);
void fft_backward(Field *f, const Domain *d);

void solve_poisson(Field *f, const Domain *d);
void compute_tendencies(Field *f, const Domain *d, const Config *cfg);
void advance_time(Field *f, const Domain *d, const Config *cfg);

void write_vtk(const char *filename, const Field *f, const Domain *d, int step);

void config_parse(Config *cfg, int argc, char **argv);
void config_print(const Config *cfg);

void load_profile_init(LoadProfile *profile);
void load_profile_free(LoadProfile *profile);
void load_profile_measure(LoadProfile *profile, const Domain *d, double compute_time, double comm_time);
double load_profile_estimate_work(const Field *f, const Domain *d);
void load_profile_gather(LoadProfile *profile, const Domain *d);

void load_balance_init(LoadBalancePlan *plan, int size);
void load_balance_free(LoadBalancePlan *plan);
void load_balance_compute(LoadBalancePlan *plan, const LoadProfile *profile,
                          const Domain *d, const Config *cfg);
void load_balance_print(const LoadBalancePlan *plan, const Domain *d);

void rebalance_domain(Domain *d, Field *f, const LoadBalancePlan *plan);
void migrate_field_data(Field *f, Domain *old_domain, Domain *new_domain,
                        const LoadBalancePlan *plan);

#endif
