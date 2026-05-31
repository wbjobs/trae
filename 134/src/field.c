#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include "weather_fft.h"

static long local_size(const Domain *d) {
    return (long)d->local_nx * d->local_ny * d->nz;
}

static long complex_size(const Domain *d) {
    return (long)d->local_nx * d->local_ny * (d->nz / 2 + 1);
}

void field_init(Field *f, const Domain *d) {
    long n_real = local_size(d);
    long n_complex = complex_size(d);

    f->u = (double *)fftw_malloc(n_real * sizeof(double));
    f->v = (double *)fftw_malloc(n_real * sizeof(double));
    f->w = (double *)fftw_malloc(n_real * sizeof(double));
    f->temperature = (double *)fftw_malloc(n_real * sizeof(double));

    f->u_hat = (fftw_complex *)fftw_malloc(n_complex * sizeof(fftw_complex));
    f->v_hat = (fftw_complex *)fftw_malloc(n_complex * sizeof(fftw_complex));
    f->w_hat = (fftw_complex *)fftw_malloc(n_complex * sizeof(fftw_complex));
    f->temp_hat = (fftw_complex *)fftw_malloc(n_complex * sizeof(fftw_complex));

    if (!f->u || !f->v || !f->w || !f->temperature ||
        !f->u_hat || !f->v_hat || !f->w_hat || !f->temp_hat) {
        fprintf(stderr, "Rank %d: Memory allocation failed\n", d->rank);
        MPI_Abort(MPI_COMM_WORLD, 1);
    }

    f->plan_forward_u_xy = fftw_plan_many_dft_r2c(
        2, (int[]){d->local_nx, d->local_ny}, d->nz,
        f->u, NULL, 1, d->nz,
        f->u_hat, NULL, 1, d->nz / 2 + 1,
        FFTW_MEASURE);

    f->plan_backward_u_xy = fftw_plan_many_dft_c2r(
        2, (int[]){d->local_nx, d->local_ny}, d->nz,
        f->u_hat, NULL, 1, d->nz / 2 + 1,
        f->u, NULL, 1, d->nz,
        FFTW_MEASURE);

    f->plan_forward_v_xy = fftw_plan_many_dft_r2c(
        2, (int[]){d->local_nx, d->local_ny}, d->nz,
        f->v, NULL, 1, d->nz,
        f->v_hat, NULL, 1, d->nz / 2 + 1,
        FFTW_MEASURE);

    f->plan_backward_v_xy = fftw_plan_many_dft_c2r(
        2, (int[]){d->local_nx, d->local_ny}, d->nz,
        f->v_hat, NULL, 1, d->nz / 2 + 1,
        f->v, NULL, 1, d->nz,
        FFTW_MEASURE);

    f->plan_forward_w_xy = fftw_plan_many_dft_r2c(
        2, (int[]){d->local_nx, d->local_ny}, d->nz,
        f->w, NULL, 1, d->nz,
        f->w_hat, NULL, 1, d->nz / 2 + 1,
        FFTW_MEASURE);

    f->plan_backward_w_xy = fftw_plan_many_dft_c2r(
        2, (int[]){d->local_nx, d->local_ny}, d->nz,
        f->w_hat, NULL, 1, d->nz / 2 + 1,
        f->w, NULL, 1, d->nz,
        FFTW_MEASURE);

    f->plan_forward_t_xy = fftw_plan_many_dft_r2c(
        2, (int[]){d->local_nx, d->local_ny}, d->nz,
        f->temperature, NULL, 1, d->nz,
        f->temp_hat, NULL, 1, d->nz / 2 + 1,
        FFTW_MEASURE);

    f->plan_backward_t_xy = fftw_plan_many_dft_c2r(
        2, (int[]){d->local_nx, d->local_ny}, d->nz,
        f->temp_hat, NULL, 1, d->nz / 2 + 1,
        f->temperature, NULL, 1, d->nz,
        FFTW_MEASURE);

    int nz_half = d->nz / 2 + 1;
    int local_size_2d = d->local_nx * d->local_ny;

    f->plan_forward_u_z = fftw_plan_many_dft_r2c(
        1, &d->nz, local_size_2d,
        f->u, NULL, local_size_2d, 1,
        f->u_hat, NULL, local_size_2d, 1,
        FFTW_MEASURE);

    f->plan_backward_u_z = fftw_plan_many_dft_c2r(
        1, &d->nz, local_size_2d,
        f->u_hat, NULL, local_size_2d, 1,
        f->u, NULL, local_size_2d, 1,
        FFTW_MEASURE);

    f->plan_forward_v_z = fftw_plan_many_dft_r2c(
        1, &d->nz, local_size_2d,
        f->v, NULL, local_size_2d, 1,
        f->v_hat, NULL, local_size_2d, 1,
        FFTW_MEASURE);

    f->plan_backward_v_z = fftw_plan_many_dft_c2r(
        1, &d->nz, local_size_2d,
        f->v_hat, NULL, local_size_2d, 1,
        f->v, NULL, local_size_2d, 1,
        FFTW_MEASURE);

    f->plan_forward_w_z = fftw_plan_many_dft_r2c(
        1, &d->nz, local_size_2d,
        f->w, NULL, local_size_2d, 1,
        f->w_hat, NULL, local_size_2d, 1,
        FFTW_MEASURE);

    f->plan_backward_w_z = fftw_plan_many_dft_c2r(
        1, &d->nz, local_size_2d,
        f->w_hat, NULL, local_size_2d, 1,
        f->w, NULL, local_size_2d, 1,
        FFTW_MEASURE);

    f->plan_forward_t_z = fftw_plan_many_dft_r2c(
        1, &d->nz, local_size_2d,
        f->temperature, NULL, local_size_2d, 1,
        f->temp_hat, NULL, local_size_2d, 1,
        FFTW_MEASURE);

    f->plan_backward_t_z = fftw_plan_many_dft_c2r(
        1, &d->nz, local_size_2d,
        f->temp_hat, NULL, local_size_2d, 1,
        f->temperature, NULL, local_size_2d, 1,
        FFTW_MEASURE);
}

void field_free(Field *f, const Domain *d) {
    fftw_destroy_plan(f->plan_forward_u_xy);
    fftw_destroy_plan(f->plan_backward_u_xy);
    fftw_destroy_plan(f->plan_forward_v_xy);
    fftw_destroy_plan(f->plan_backward_v_xy);
    fftw_destroy_plan(f->plan_forward_w_xy);
    fftw_destroy_plan(f->plan_backward_w_xy);
    fftw_destroy_plan(f->plan_forward_t_xy);
    fftw_destroy_plan(f->plan_backward_t_xy);

    fftw_destroy_plan(f->plan_forward_u_z);
    fftw_destroy_plan(f->plan_backward_u_z);
    fftw_destroy_plan(f->plan_forward_v_z);
    fftw_destroy_plan(f->plan_backward_v_z);
    fftw_destroy_plan(f->plan_forward_w_z);
    fftw_destroy_plan(f->plan_backward_w_z);
    fftw_destroy_plan(f->plan_forward_t_z);
    fftw_destroy_plan(f->plan_backward_t_z);

    fftw_free(f->u);
    fftw_free(f->v);
    fftw_free(f->w);
    fftw_free(f->temperature);
    fftw_free(f->u_hat);
    fftw_free(f->v_hat);
    fftw_free(f->w_hat);
    fftw_free(f->temp_hat);
}

void field_initialize_conditions(Field *f, const Domain *d) {
    long n = local_size(d);
    double lx = 2.0 * M_PI;
    double ly = 2.0 * M_PI;
    double lz = 1.0;

    for (int i = 0; i < d->local_nx; i++) {
        for (int j = 0; j < d->local_ny; j++) {
            for (int k = 0; k < d->nz; k++) {
                long idx = (long)i * d->local_ny * d->nz + (long)j * d->nz + k;

                double x = (d->local_x_start + i) * lx / d->nx;
                double y = (d->local_y_start + j) * ly / d->ny;
                double z = k * lz / d->nz;

                f->u[idx] = sin(x) * cos(y) * sin(2.0 * M_PI * z);
                f->v[idx] = -cos(x) * sin(y) * sin(2.0 * M_PI * z);
                f->w[idx] = 0.1 * sin(2.0 * x) * sin(2.0 * y) * cos(2.0 * M_PI * z);

                double t_background = 300.0 - 5.0 * z;
                double t_perturbation = 5.0 * sin(x) * sin(y) * exp(-pow(z - 0.5, 2) * 10.0);
                f->temperature[idx] = t_background + t_perturbation;
            }
        }
    }
}

void fft_forward(Field *f, const Domain *d) {
    fftw_execute(f->plan_forward_u_xy);
    fftw_execute(f->plan_forward_v_xy);
    fftw_execute(f->plan_forward_w_xy);
    fftw_execute(f->plan_forward_t_xy);

    transpose_xy_to_z(f, d);

    fftw_execute(f->plan_forward_u_z);
    fftw_execute(f->plan_forward_v_z);
    fftw_execute(f->plan_forward_w_z);
    fftw_execute(f->plan_forward_t_z);
}

void fft_backward(Field *f, const Domain *d) {
    fftw_execute(f->plan_backward_u_z);
    fftw_execute(f->plan_backward_v_z);
    fftw_execute(f->plan_backward_w_z);
    fftw_execute(f->plan_backward_t_z);

    transpose_z_to_xy(f, d);

    fftw_execute(f->plan_backward_u_xy);
    fftw_execute(f->plan_backward_v_xy);
    fftw_execute(f->plan_backward_w_xy);
    fftw_execute(f->plan_backward_t_xy);

    long n = local_size(d);
    double norm = 1.0 / (d->nx * d->ny * d->nz);
    for (long i = 0; i < n; i++) {
        f->u[i] *= norm;
        f->v[i] *= norm;
        f->w[i] *= norm;
        f->temperature[i] *= norm;
    }
}
