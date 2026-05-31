#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "weather_fft.h"

static int compute_local_size(int global_size, int rank, int num_procs) {
    int base = global_size / num_procs;
    int remainder = global_size % num_procs;
    return (rank < remainder) ? (base + 1) : base;
}

static int compute_start(int global_size, int rank, int num_procs) {
    int base = global_size / num_procs;
    int remainder = global_size % num_procs;
    if (rank < remainder) {
        return rank * (base + 1);
    } else {
        return remainder * (base + 1) + (rank - remainder) * base;
    }
}

static void compute_new_domain_params(const LoadBalancePlan *plan,
                                      const Domain *old_domain,
                                      int *new_local_nx, int *new_local_ny,
                                      int *new_x_start, int *new_y_start,
                                      int *new_px, int *new_py) {
    int num_groups = plan->num_partitions;
    int my_group = plan->rank_assignments[old_domain->rank];

    int groups_per_row = (int)sqrt(num_groups);
    while (num_groups % groups_per_row != 0 && groups_per_row > 1) {
        groups_per_row--;
    }
    int groups_per_col = num_groups / groups_per_row;

    int group_row = my_group / groups_per_col;
    int group_col = my_group % groups_per_col;

    int ranks_in_my_group = plan->partition_sizes[my_group];
    int my_rank_in_group = 0;
    for (int i = 0; i < old_domain->rank; i++) {
        if (plan->rank_assignments[i] == my_group) {
            my_rank_in_group++;
        }
    }

    int ranks_per_row = (int)sqrt(ranks_in_my_group);
    while (ranks_in_my_group % ranks_per_row != 0 && ranks_per_row > 1) {
        ranks_per_row--;
    }
    int ranks_per_col = ranks_in_my_group / ranks_per_row;

    int group_nx = (old_domain->nx * (group_row + 1)) / groups_per_row -
                   (old_domain->nx * group_row) / groups_per_row;
    int group_ny = (old_domain->ny * (group_col + 1)) / groups_per_col -
                   (old_domain->ny * group_col) / groups_per_col;

    int group_x_start = (old_domain->nx * group_row) / groups_per_row;
    int group_y_start = (old_domain->ny * group_col) / groups_per_col;

    int local_rank_row = my_rank_in_group / ranks_per_col;
    int local_rank_col = my_rank_in_group % ranks_per_col;

    *new_local_nx = compute_local_size(group_nx, local_rank_row, ranks_per_row);
    *new_local_ny = compute_local_size(group_ny, local_rank_col, ranks_per_col);
    *new_x_start = group_x_start + compute_start(group_nx, local_rank_row, ranks_per_row);
    *new_y_start = group_y_start + compute_start(group_ny, local_rank_col, ranks_per_col);
    *new_px = groups_per_row;
    *new_py = groups_per_col;
}

void migrate_field_data(Field *f, Domain *old_domain, Domain *new_domain,
                        const LoadBalancePlan *plan) {
    long old_n = (long)old_domain->local_nx * old_domain->local_ny * old_domain->nz;
    long new_n = (long)new_domain->local_nx * new_domain->local_ny * new_domain->nz;
    int nz_half = old_domain->nz / 2 + 1;
    long old_complex = (long)old_domain->local_nx * old_domain->local_ny * nz_half;
    long new_complex = (long)new_domain->local_nx * new_domain->local_ny * nz_half;

    double *new_u = (double *)fftw_malloc(new_n * sizeof(double));
    double *new_v = (double *)fftw_malloc(new_n * sizeof(double));
    double *new_w = (double *)fftw_malloc(new_n * sizeof(double));
    double *new_t = (double *)fftw_malloc(new_n * sizeof(double));
    fftw_complex *new_u_hat = (fftw_complex *)fftw_malloc(new_complex * sizeof(fftw_complex));
    fftw_complex *new_v_hat = (fftw_complex *)fftw_malloc(new_complex * sizeof(fftw_complex));
    fftw_complex *new_w_hat = (fftw_complex *)fftw_malloc(new_complex * sizeof(fftw_complex));
    fftw_complex *new_t_hat = (fftw_complex *)fftw_malloc(new_complex * sizeof(fftw_complex));

    memset(new_u, 0, new_n * sizeof(double));
    memset(new_v, 0, new_n * sizeof(double));
    memset(new_w, 0, new_n * sizeof(double));
    memset(new_t, 0, new_n * sizeof(double));
    memset(new_u_hat, 0, new_complex * sizeof(fftw_complex));
    memset(new_v_hat, 0, new_complex * sizeof(fftw_complex));
    memset(new_w_hat, 0, new_complex * sizeof(fftw_complex));
    memset(new_t_hat, 0, new_complex * sizeof(fftw_complex));

    for (int src_rank = 0; src_rank < old_domain->size; src_rank++) {
        int src_coords[2];
        MPI_Cart_coords(old_domain->cart_comm, src_rank, 2, src_coords);

        int src_nx = compute_local_size(old_domain->nx, src_coords[0], old_domain->px);
        int src_ny = compute_local_size(old_domain->ny, src_coords[1], old_domain->py);
        int src_x_start = compute_start(old_domain->nx, src_coords[0], old_domain->px);
        int src_y_start = compute_start(old_domain->ny, src_coords[1], old_domain->py);

        for (int i = 0; i < src_nx; i++) {
            int global_i = src_x_start + i;
            if (global_i < new_domain->local_x_start ||
                global_i >= new_domain->local_x_start + new_domain->local_nx) {
                continue;
            }
            int local_i = global_i - new_domain->local_x_start;

            for (int j = 0; j < src_ny; j++) {
                int global_j = src_y_start + j;
                if (global_j < new_domain->local_y_start ||
                    global_j >= new_domain->local_y_start + new_domain->local_ny) {
                    continue;
                }
                int local_j = global_j - new_domain->local_y_start;

                for (int k = 0; k < old_domain->nz; k++) {
                    long src_idx = (long)i * src_ny * old_domain->nz +
                                   (long)j * old_domain->nz + k;
                    long dst_idx = (long)local_i * new_domain->local_ny * old_domain->nz +
                                   (long)local_j * old_domain->nz + k;

                    if (src_rank == old_domain->rank) {
                        new_u[dst_idx] = f->u[src_idx];
                        new_v[dst_idx] = f->v[src_idx];
                        new_w[dst_idx] = f->w[src_idx];
                        new_t[dst_idx] = f->temperature[src_idx];
                    } else {
                        double data[4];
                        MPI_Recv(data, 4, MPI_DOUBLE, src_rank, 0,
                                MPI_COMM_WORLD, MPI_STATUS_IGNORE);
                        new_u[dst_idx] = data[0];
                        new_v[dst_idx] = data[1];
                        new_w[dst_idx] = data[2];
                        new_t[dst_idx] = data[3];
                    }
                }

                for (int k = 0; k < nz_half; k++) {
                    long src_idx = (long)i * src_ny * nz_half +
                                   (long)j * nz_half + k;
                    long dst_idx = (long)local_i * new_domain->local_ny * nz_half +
                                   (long)local_j * nz_half + k;

                    if (src_rank == old_domain->rank) {
                        new_u_hat[dst_idx][0] = f->u_hat[src_idx][0];
                        new_u_hat[dst_idx][1] = f->u_hat[src_idx][1];
                        new_v_hat[dst_idx][0] = f->v_hat[src_idx][0];
                        new_v_hat[dst_idx][1] = f->v_hat[src_idx][1];
                        new_w_hat[dst_idx][0] = f->w_hat[src_idx][0];
                        new_w_hat[dst_idx][1] = f->w_hat[src_idx][1];
                        new_t_hat[dst_idx][0] = f->temp_hat[src_idx][0];
                        new_t_hat[dst_idx][1] = f->temp_hat[src_idx][1];
                    } else {
                        double data[8];
                        MPI_Recv(data, 8, MPI_DOUBLE, src_rank, 1,
                                MPI_COMM_WORLD, MPI_STATUS_IGNORE);
                        new_u_hat[dst_idx][0] = data[0];
                        new_u_hat[dst_idx][1] = data[1];
                        new_v_hat[dst_idx][0] = data[2];
                        new_v_hat[dst_idx][1] = data[3];
                        new_w_hat[dst_idx][0] = data[4];
                        new_w_hat[dst_idx][1] = data[5];
                        new_t_hat[dst_idx][0] = data[6];
                        new_t_hat[dst_idx][1] = data[7];
                    }
                }
            }
        }
    }

    for (int i = 0; i < old_domain->local_nx; i++) {
        for (int j = 0; j < old_domain->local_ny; j++) {
            int global_i = old_domain->local_x_start + i;
            int global_j = old_domain->local_y_start + j;

            for (int dst_rank = 0; dst_rank < old_domain->size; dst_rank++) {
                if (dst_rank == old_domain->rank) continue;

                int dst_coords[2];
                MPI_Cart_coords(old_domain->cart_comm, dst_rank, 2, dst_coords);

                int dst_nx = compute_local_size(old_domain->nx, dst_coords[0], old_domain->px);
                int dst_ny = compute_local_size(old_domain->ny, dst_coords[1], old_domain->py);
                int dst_x_start = compute_start(old_domain->nx, dst_coords[0], old_domain->px);
                int dst_y_start = compute_start(old_domain->ny, dst_coords[1], old_domain->py);

                if (global_i >= dst_x_start && global_i < dst_x_start + dst_nx &&
                    global_j >= dst_y_start && global_j < dst_y_start + dst_ny) {

                    for (int k = 0; k < old_domain->nz; k++) {
                        long src_idx = (long)i * old_domain->local_ny * old_domain->nz +
                                       (long)j * old_domain->nz + k;
                        double data[4] = {f->u[src_idx], f->v[src_idx],
                                         f->w[src_idx], f->temperature[src_idx]};
                        MPI_Send(data, 4, MPI_DOUBLE, dst_rank, 0, MPI_COMM_WORLD);
                    }

                    for (int k = 0; k < nz_half; k++) {
                        long src_idx = (long)i * old_domain->local_ny * nz_half +
                                       (long)j * nz_half + k;
                        double data[8] = {
                            f->u_hat[src_idx][0], f->u_hat[src_idx][1],
                            f->v_hat[src_idx][0], f->v_hat[src_idx][1],
                            f->w_hat[src_idx][0], f->w_hat[src_idx][1],
                            f->temp_hat[src_idx][0], f->temp_hat[src_idx][1]
                        };
                        MPI_Send(data, 8, MPI_DOUBLE, dst_rank, 1, MPI_COMM_WORLD);
                    }
                }
            }
        }
    }

    fftw_free(f->u);
    fftw_free(f->v);
    fftw_free(f->w);
    fftw_free(f->temperature);
    fftw_free(f->u_hat);
    fftw_free(f->v_hat);
    fftw_free(f->w_hat);
    fftw_free(f->temp_hat);

    f->u = new_u;
    f->v = new_v;
    f->w = new_w;
    f->temperature = new_t;
    f->u_hat = new_u_hat;
    f->v_hat = new_v_hat;
    f->w_hat = new_w_hat;
    f->temp_hat = new_t_hat;
}

void rebalance_domain(Domain *d, Field *f, const LoadBalancePlan *plan) {
    int new_local_nx, new_local_ny, new_x_start, new_y_start, new_px, new_py;
    compute_new_domain_params(plan, d, &new_local_nx, &new_local_ny,
                              &new_x_start, &new_y_start, &new_px, &new_py);

    if (new_local_nx == d->local_nx && new_local_ny == d->local_ny &&
        new_x_start == d->local_x_start && new_y_start == d->local_y_start) {
        return;
    }

    Domain new_domain = *d;
    new_domain.local_nx = new_local_nx;
    new_domain.local_ny = new_local_ny;
    new_domain.local_x_start = new_x_start;
    new_domain.local_y_start = new_y_start;
    new_domain.px = new_px;
    new_domain.py = new_py;

    int new_dims[2] = {new_px, new_py};
    int new_periods[2] = {1, 1};
    MPI_Comm_free(&new_domain.cart_comm);
    MPI_Cart_create(MPI_COMM_WORLD, 2, new_dims, new_periods, 0, &new_domain.cart_comm);

    int new_remain_dims[2] = {0, 1};
    MPI_Cart_sub(new_domain.cart_comm, new_remain_dims, &new_domain.row_comm);
    new_remain_dims[0] = 1;
    new_remain_dims[1] = 0;
    MPI_Cart_sub(new_domain.cart_comm, new_remain_dims, &new_domain.col_comm);

    migrate_field_data(f, d, &new_domain, plan);

    if (d->rank == 0) {
        printf("Rebalancing domain: (%d,%d) -> (%d,%d)\n",
               d->local_nx, d->local_ny, new_local_nx, new_local_ny);
    }

    *d = new_domain;
}
