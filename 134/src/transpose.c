#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "weather_fft.h"

static void pack_real_field(const double *src, double *dst,
                            int local_nx, int local_ny, int nz,
                            int px, int py, int my_coord_x, int my_coord_y,
                            int (*get_size)(int, int, int)) {
    int nz_half = nz / 2 + 1;
    long idx = 0;

    for (int i = 0; i < px; i++) {
        int remote_nx = get_size(i, local_nx, px);
        for (int j = 0; j < local_ny; j++) {
            for (int k = 0; k < nz; k++) {
                for (int ii = 0; ii < remote_nx; ii++) {
                    long src_idx = (long)ii * local_ny * nz + (long)j * nz + k;
                    dst[idx++] = src[src_idx];
                }
            }
        }
    }
}

static void unpack_real_field(const double *src, double *dst,
                              int local_nx, int local_ny, int nz,
                              int px, int py, int my_coord_x, int my_coord_y,
                              int (*get_size)(int, int, int)) {
    int nz_half = nz / 2 + 1;
    long idx = 0;

    for (int i = 0; i < px; i++) {
        int remote_nx = get_size(i, local_nx, px);
        for (int j = 0; j < local_ny; j++) {
            for (int k = 0; k < nz; k++) {
                for (int ii = 0; ii < remote_nx; ii++) {
                    long dst_idx = (long)ii * local_ny * nz + (long)j * nz + k;
                    dst[dst_idx] = src[idx++];
                }
            }
        }
    }
}

static void pack_complex_field(const fftw_complex *src, fftw_complex *dst,
                               int local_nx, int local_ny, int nz,
                               int px, int py, int my_coord_x, int my_coord_y,
                               int (*get_size)(int, int, int)) {
    int nz_half = nz / 2 + 1;
    long idx = 0;

    for (int i = 0; i < px; i++) {
        int remote_nx = get_size(i, local_nx, px);
        for (int j = 0; j < local_ny; j++) {
            for (int k = 0; k < nz_half; k++) {
                for (int ii = 0; ii < remote_nx; ii++) {
                    long src_idx = (long)ii * local_ny * nz_half + (long)j * nz_half + k;
                    dst[idx][0] = src[src_idx][0];
                    dst[idx][1] = src[src_idx][1];
                    idx++;
                }
            }
        }
    }
}

static void unpack_complex_field(const fftw_complex *src, fftw_complex *dst,
                                 int local_nx, int local_ny, int nz,
                                 int px, int py, int my_coord_x, int my_coord_y,
                                 int (*get_size)(int, int, int)) {
    int nz_half = nz / 2 + 1;
    long idx = 0;

    for (int i = 0; i < px; i++) {
        int remote_nx = get_size(i, local_nx, px);
        for (int j = 0; j < local_ny; j++) {
            for (int k = 0; k < nz_half; k++) {
                for (int ii = 0; ii < remote_nx; ii++) {
                    long dst_idx = (long)ii * local_ny * nz_half + (long)j * nz_half + k;
                    dst[dst_idx][0] = src[idx][0];
                    dst[dst_idx][1] = src[idx][1];
                    idx++;
                }
            }
        }
    }
}

static int compute_local_size_static(int global_idx, int local_size, int num_procs) {
    return local_size;
}

void transpose_xy_to_z(Field *f, const Domain *d) {
    int nz_half = d->nz / 2 + 1;
    long local_complex_size = (long)d->local_nx * d->local_ny * nz_half;

    fftw_complex *send_buf = (fftw_complex *)fftw_malloc(local_complex_size * sizeof(fftw_complex));
    fftw_complex *recv_buf = (fftw_complex *)fftw_malloc(local_complex_size * sizeof(fftw_complex));

    pack_complex_field(f->u_hat, send_buf, d->local_nx, d->local_ny, d->nz,
                       d->px, d->py, d->coords[0], d->coords[1],
                       compute_local_size_static);

    MPI_Alltoallv(send_buf, d->sendcounts_x, d->senddispls_x, MPI_DOUBLE_COMPLEX,
                  recv_buf, d->recvcounts_x, d->recvdispls_x, MPI_DOUBLE_COMPLEX,
                  d->row_comm);

    unpack_complex_field(recv_buf, f->u_hat, d->local_nx, d->local_ny, d->nz,
                         d->px, d->py, d->coords[0], d->coords[1],
                         compute_local_size_static);

    pack_complex_field(f->v_hat, send_buf, d->local_nx, d->local_ny, d->nz,
                       d->px, d->py, d->coords[0], d->coords[1],
                       compute_local_size_static);

    MPI_Alltoallv(send_buf, d->sendcounts_x, d->senddispls_x, MPI_DOUBLE_COMPLEX,
                  recv_buf, d->recvcounts_x, d->recvdispls_x, MPI_DOUBLE_COMPLEX,
                  d->row_comm);

    unpack_complex_field(recv_buf, f->v_hat, d->local_nx, d->local_ny, d->nz,
                         d->px, d->py, d->coords[0], d->coords[1],
                         compute_local_size_static);

    pack_complex_field(f->w_hat, send_buf, d->local_nx, d->local_ny, d->nz,
                       d->px, d->py, d->coords[0], d->coords[1],
                       compute_local_size_static);

    MPI_Alltoallv(send_buf, d->sendcounts_x, d->senddispls_x, MPI_DOUBLE_COMPLEX,
                  recv_buf, d->recvcounts_x, d->recvdispls_x, MPI_DOUBLE_COMPLEX,
                  d->row_comm);

    unpack_complex_field(recv_buf, f->w_hat, d->local_nx, d->local_ny, d->nz,
                         d->px, d->py, d->coords[0], d->coords[1],
                         compute_local_size_static);

    pack_complex_field(f->temp_hat, send_buf, d->local_nx, d->local_ny, d->nz,
                       d->px, d->py, d->coords[0], d->coords[1],
                       compute_local_size_static);

    MPI_Alltoallv(send_buf, d->sendcounts_x, d->senddispls_x, MPI_DOUBLE_COMPLEX,
                  recv_buf, d->recvcounts_x, d->recvdispls_x, MPI_DOUBLE_COMPLEX,
                  d->row_comm);

    unpack_complex_field(recv_buf, f->temp_hat, d->local_nx, d->local_ny, d->nz,
                         d->px, d->py, d->coords[0], d->coords[1],
                         compute_local_size_static);

    fftw_free(send_buf);
    fftw_free(recv_buf);
}

void transpose_z_to_xy(Field *f, const Domain *d) {
    int nz_half = d->nz / 2 + 1;
    long local_complex_size = (long)d->local_nx * d->local_ny * nz_half;

    fftw_complex *send_buf = (fftw_complex *)fftw_malloc(local_complex_size * sizeof(fftw_complex));
    fftw_complex *recv_buf = (fftw_complex *)fftw_malloc(local_complex_size * sizeof(fftw_complex));

    pack_complex_field(f->u_hat, send_buf, d->local_nx, d->local_ny, d->nz,
                       d->py, d->px, d->coords[1], d->coords[0],
                       compute_local_size_static);

    MPI_Alltoallv(send_buf, d->sendcounts_z, d->senddispls_z, MPI_DOUBLE_COMPLEX,
                  recv_buf, d->recvcounts_z, d->recvdispls_z, MPI_DOUBLE_COMPLEX,
                  d->col_comm);

    unpack_complex_field(recv_buf, f->u_hat, d->local_nx, d->local_ny, d->nz,
                         d->py, d->px, d->coords[1], d->coords[0],
                         compute_local_size_static);

    pack_complex_field(f->v_hat, send_buf, d->local_nx, d->local_ny, d->nz,
                       d->py, d->px, d->coords[1], d->coords[0],
                       compute_local_size_static);

    MPI_Alltoallv(send_buf, d->sendcounts_z, d->senddispls_z, MPI_DOUBLE_COMPLEX,
                  recv_buf, d->recvcounts_z, d->recvdispls_z, MPI_DOUBLE_COMPLEX,
                  d->col_comm);

    unpack_complex_field(recv_buf, f->v_hat, d->local_nx, d->local_ny, d->nz,
                         d->py, d->px, d->coords[1], d->coords[0],
                         compute_local_size_static);

    pack_complex_field(f->w_hat, send_buf, d->local_nx, d->local_ny, d->nz,
                       d->py, d->px, d->coords[1], d->coords[0],
                       compute_local_size_static);

    MPI_Alltoallv(send_buf, d->sendcounts_z, d->senddispls_z, MPI_DOUBLE_COMPLEX,
                  recv_buf, d->recvcounts_z, d->recvdispls_z, MPI_DOUBLE_COMPLEX,
                  d->col_comm);

    unpack_complex_field(recv_buf, f->w_hat, d->local_nx, d->local_ny, d->nz,
                         d->py, d->px, d->coords[1], d->coords[0],
                         compute_local_size_static);

    pack_complex_field(f->temp_hat, send_buf, d->local_nx, d->local_ny, d->nz,
                       d->py, d->px, d->coords[1], d->coords[0],
                       compute_local_size_static);

    MPI_Alltoallv(send_buf, d->sendcounts_z, d->senddispls_z, MPI_DOUBLE_COMPLEX,
                  recv_buf, d->recvcounts_z, d->recvdispls_z, MPI_DOUBLE_COMPLEX,
                  d->col_comm);

    unpack_complex_field(recv_buf, f->temp_hat, d->local_nx, d->local_ny, d->nz,
                         d->py, d->px, d->coords[1], d->coords[0],
                         compute_local_size_static);

    fftw_free(send_buf);
    fftw_free(recv_buf);
}
