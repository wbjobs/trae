#include <stdio.h>
#include <stdlib.h>
#include <math.h>
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

static void compute_alltoallv_params(Domain *d) {
    int nz_half = d->nz / 2 + 1;

    d->sendcounts_x = (int *)malloc(d->px * sizeof(int));
    d->senddispls_x = (int *)malloc(d->px * sizeof(int));
    d->recvcounts_x = (int *)malloc(d->px * sizeof(int));
    d->recvdispls_x = (int *)malloc(d->px * sizeof(int));

    for (int i = 0; i < d->px; i++) {
        int src_nx = compute_local_size(d->nx, i, d->px);
        d->sendcounts_x[i] = d->local_ny * nz_half * src_nx;
        d->recvcounts_x[i] = d->local_ny * nz_half * src_nx;
    }

    d->senddispls_x[0] = 0;
    d->recvdispls_x[0] = 0;
    for (int i = 1; i < d->px; i++) {
        d->senddispls_x[i] = d->senddispls_x[i-1] + d->sendcounts_x[i-1];
        d->recvdispls_x[i] = d->recvdispls_x[i-1] + d->recvcounts_x[i-1];
    }

    d->sendcounts_z = (int *)malloc(d->py * sizeof(int));
    d->senddispls_z = (int *)malloc(d->py * sizeof(int));
    d->recvcounts_z = (int *)malloc(d->py * sizeof(int));
    d->recvdispls_z = (int *)malloc(d->py * sizeof(int));

    for (int j = 0; j < d->py; j++) {
        int src_ny = compute_local_size(d->ny, j, d->py);
        d->sendcounts_z[j] = d->local_nx * nz_half * src_ny;
        d->recvcounts_z[j] = d->local_nx * nz_half * src_ny;
    }

    d->senddispls_z[0] = 0;
    d->recvdispls_z[0] = 0;
    for (int j = 1; j < d->py; j++) {
        d->senddispls_z[j] = d->senddispls_z[j-1] + d->sendcounts_z[j-1];
        d->recvdispls_z[j] = d->recvdispls_z[j-1] + d->recvcounts_z[j-1];
    }

    long max_count = 0;
    for (int i = 0; i < d->px; i++) {
        if (d->sendcounts_x[i] > max_count) max_count = d->sendcounts_x[i];
    }
    for (int j = 0; j < d->py; j++) {
        if (d->sendcounts_z[j] > max_count) max_count = d->sendcounts_z[j];
    }

    d->transpose_buf_size = max_count;
    d->transpose_buf = (double *)fftw_malloc(max_count * 2 * sizeof(double));
}

void domain_init(Domain *d, int nx, int ny, int nz, MPI_Comm comm) {
    d->nx = nx;
    d->ny = ny;
    d->nz = nz;

    MPI_Comm_rank(comm, &d->rank);
    MPI_Comm_size(comm, &d->size);

    d->px = (int)sqrt(d->size);
    while (d->size % d->px != 0) {
        d->px--;
    }
    d->py = d->size / d->px;

    if (d->px > nx || d->py > ny) {
        if (d->rank == 0) {
            fprintf(stderr, "Error: Too many processes for grid size\n");
            fprintf(stderr, "  Grid: %d x %d, Processes: %d (%d x %d)\n", nx, ny, d->size, d->px, d->py);
        }
        MPI_Abort(comm, 1);
    }

    int dims[2] = {d->px, d->py};
    int periods[2] = {1, 1};
    MPI_Cart_create(comm, 2, dims, periods, 0, &d->cart_comm);
    MPI_Cart_coords(d->cart_comm, d->rank, 2, d->coords);

    int remain_dims[2] = {0, 1};
    MPI_Cart_sub(d->cart_comm, remain_dims, &d->row_comm);

    remain_dims[0] = 1;
    remain_dims[1] = 0;
    MPI_Cart_sub(d->cart_comm, remain_dims, &d->col_comm);

    d->local_nx = compute_local_size(nx, d->coords[0], d->px);
    d->local_ny = compute_local_size(ny, d->coords[1], d->py);
    d->local_x_start = compute_start(nx, d->coords[0], d->px);
    d->local_y_start = compute_start(ny, d->coords[1], d->py);

    compute_alltoallv_params(d);

    if (d->rank == 0) {
        printf("=== Domain Decomposition ===\n");
        printf("Global grid: %d x %d x %d\n", nx, ny, nz);
        printf("Process grid: %d x %d (total %d)\n", d->px, d->py, d->size);
        printf("============================\n");
    }
}

void domain_free(Domain *d) {
    if (d->cart_comm != MPI_COMM_NULL) MPI_Comm_free(&d->cart_comm);
    if (d->row_comm != MPI_COMM_NULL) MPI_Comm_free(&d->row_comm);
    if (d->col_comm != MPI_COMM_NULL) MPI_Comm_free(&d->col_comm);

    free(d->sendcounts_x);
    free(d->senddispls_x);
    free(d->recvcounts_x);
    free(d->recvdispls_x);
    free(d->sendcounts_z);
    free(d->senddispls_z);
    free(d->recvcounts_z);
    free(d->recvdispls_z);

    fftw_free(d->transpose_buf);
}

void domain_print_info(const Domain *d) {
    printf("Rank %d: coords=(%d,%d), local=(%d:%d, %d:%d), size=(%d,%d,%d)\n",
           d->rank, d->coords[0], d->coords[1],
           d->local_x_start, d->local_x_start + d->local_nx - 1,
           d->local_y_start, d->local_y_start + d->local_ny - 1,
           d->local_nx, d->local_ny, d->nz);
}
