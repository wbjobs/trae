#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <string.h>
#include "weather_fft.h"

void load_profile_init(LoadProfile *profile) {
    profile->local_work = 0.0;
    profile->all_works = NULL;
    profile->imbalance_ratio = 1.0;
    profile->needs_rebalancing = 0;
    profile->sample_count = 0;
    memset(profile->compute_times, 0, sizeof(profile->compute_times));
    memset(profile->communication_times, 0, sizeof(profile->communication_times));
}

void load_profile_free(LoadProfile *profile) {
    free(profile->all_works);
    profile->all_works = NULL;
}

static double estimate_nonuniform_work(const Field *f, const Domain *d) {
    double work = 0.0;
    long n = (long)d->local_nx * d->local_ny * d->nz;
    int nz_half = d->nz / 2 + 1;

    for (int i = 0; i < d->local_nx; i++) {
        for (int j = 0; j < d->local_ny; j++) {
            for (int k = 0; k < d->nz; k++) {
                long idx = (long)i * d->local_ny * d->nz + (long)j * d->nz + k;

                double x = (d->local_x_start + i) * 2.0 * M_PI / d->nx;
                double y = (d->local_y_start + j) * 2.0 * M_PI / d->ny;
                double z = (double)k / d->nz;

                double temp_grad = fabs(f->temperature[idx] - 300.0 + 5.0 * z);
                double vel_mag = sqrt(f->u[idx]*f->u[idx] + f->v[idx]*f->v[idx] + f->w[idx]*f->w[idx]);

                double complexity = 1.0 + temp_grad * 0.1 + vel_mag * 0.5;
                work += complexity;
            }
        }
    }

    double fft_work = (double)d->local_nx * d->local_ny * d->nz *
                      (log2(d->nx) + log2(d->ny) + log2(d->nz));

    return work + fft_work * 0.01;
}

double load_profile_estimate_work(const Field *f, const Domain *d) {
    return estimate_nonuniform_work(f, d);
}

void load_profile_measure(LoadProfile *profile, const Domain *d,
                          double compute_time, double comm_time) {
    if (profile->sample_count < MAX_LOAD_SAMPLES) {
        profile->compute_times[profile->sample_count] = compute_time;
        profile->communication_times[profile->sample_count] = comm_time;
        profile->sample_count++;
    }

    double avg_compute = 0.0, avg_comm = 0.0;
    for (int i = 0; i < profile->sample_count; i++) {
        avg_compute += profile->compute_times[i];
        avg_comm += profile->communication_times[i];
    }
    avg_compute /= profile->sample_count;
    avg_comm /= profile->sample_count;

    profile->local_work = avg_compute + avg_comm;
}

void load_profile_gather(LoadProfile *profile, const Domain *d) {
    if (!profile->all_works) {
        profile->all_works = (double *)malloc(d->size * sizeof(double));
    }

    MPI_Allgather(&profile->local_work, 1, MPI_DOUBLE,
                  profile->all_works, 1, MPI_DOUBLE, MPI_COMM_WORLD);

    double min_work = profile->all_works[0];
    double max_work = profile->all_works[0];
    double total_work = 0.0;

    for (int i = 0; i < d->size; i++) {
        if (profile->all_works[i] < min_work) min_work = profile->all_works[i];
        if (profile->all_works[i] > max_work) max_work = profile->all_works[i];
        total_work += profile->all_works[i];
    }

    if (min_work > 1e-15) {
        profile->imbalance_ratio = max_work / min_work;
    } else {
        profile->imbalance_ratio = 1.0;
    }
}
