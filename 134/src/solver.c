#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include "weather_fft.h"

static long complex_idx(int i, int j, int k, const Domain *d) {
    int nz_half = d->nz / 2 + 1;
    return (long)i * d->local_ny * nz_half + (long)j * nz_half + k;
}

static void get_wavenumbers(int i, int j, int k, const Domain *d,
                            double *kx, double *ky, double *kz) {
    int gi = d->local_x_start + i;
    int gj = d->local_y_start + j;

    *kx = (gi <= d->nx / 2) ? 2.0 * M_PI * gi / d->nx
                            : 2.0 * M_PI * (gi - d->nx) / d->nx;
    *ky = (gj <= d->ny / 2) ? 2.0 * M_PI * gj / d->ny
                            : 2.0 * M_PI * (gj - d->ny) / d->ny;
    *kz = 2.0 * M_PI * k / d->nz;
}

void solve_poisson(Field *f, const Domain *d) {
    int nz_half = d->nz / 2 + 1;

    for (int i = 0; i < d->local_nx; i++) {
        for (int j = 0; j < d->local_ny; j++) {
            for (int k = 0; k < nz_half; k++) {
                long idx = complex_idx(i, j, k, d);

                double kx, ky, kz;
                get_wavenumbers(i, j, k, d, &kx, &ky, &kz);

                double k_sq = kx * kx + ky * ky + kz * kz;

                if (k_sq > 1e-15) {
                    double div = kx * f->u_hat[idx][0] + ky * f->v_hat[idx][0] + kz * f->w_hat[idx][0];
                    double div_i = kx * f->u_hat[idx][1] + ky * f->v_hat[idx][1] + kz * f->w_hat[idx][1];

                    f->u_hat[idx][0] -= kx * div / k_sq;
                    f->u_hat[idx][1] -= kx * div_i / k_sq;
                    f->v_hat[idx][0] -= ky * div / k_sq;
                    f->v_hat[idx][1] -= ky * div_i / k_sq;
                    f->w_hat[idx][0] -= kz * div / k_sq;
                    f->w_hat[idx][1] -= kz * div_i / k_sq;
                } else {
                    f->u_hat[idx][0] = 0.0;
                    f->u_hat[idx][1] = 0.0;
                    f->v_hat[idx][0] = 0.0;
                    f->v_hat[idx][1] = 0.0;
                    f->w_hat[idx][0] = 0.0;
                    f->w_hat[idx][1] = 0.0;
                }
            }
        }
    }
}

void compute_tendencies(Field *f, const Domain *d, const Config *cfg) {
    int nz_half = d->nz / 2 + 1;

    for (int i = 0; i < d->local_nx; i++) {
        for (int j = 0; j < d->local_ny; j++) {
            for (int k = 0; k < nz_half; k++) {
                long idx = complex_idx(i, j, k, d);

                double kx, ky, kz;
                get_wavenumbers(i, j, k, d, &kx, &ky, &kz);

                double k_sq = kx * kx + ky * ky + kz * kz;
                double nu = cfg->viscosity;
                double kappa = cfg->thermal_diffusivity;

                double damping = exp(-(nu * k_sq) * cfg->dt);
                double thermal_damping = exp(-(kappa * k_sq) * cfg->dt);

                f->u_hat[idx][0] *= damping;
                f->u_hat[idx][1] *= damping;
                f->v_hat[idx][0] *= damping;
                f->v_hat[idx][1] *= damping;
                f->w_hat[idx][0] *= damping;
                f->w_hat[idx][1] *= damping;
                f->temp_hat[idx][0] *= thermal_damping;
                f->temp_hat[idx][1] *= thermal_damping;

                double g = 9.81;
                double t0 = 300.0;
                double buoyancy = g / t0;
                if (k_sq > 1e-15) {
                    f->w_hat[idx][0] += buoyancy * f->temp_hat[idx][0] * kz / k_sq;
                    f->w_hat[idx][1] += buoyancy * f->temp_hat[idx][1] * kz / k_sq;
                }
            }
        }
    }
}

void advance_time(Field *f, const Domain *d, const Config *cfg) {
    fft_forward(f, d);

    compute_tendencies(f, d, cfg);

    solve_poisson(f, d);

    fft_backward(f, d);

    long n = (long)d->local_nx * d->local_ny * d->nz;
    double dt = cfg->dt;
    for (long i = 0; i < n; i++) {
        f->temperature[i] += dt * 0.1 * f->w[i];
    }
}
