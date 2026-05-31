#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "weather_fft.h"

static long idx3d(int i, int j, int k, const Domain *d) {
    return (long)i * d->local_ny * d->nz + (long)j * d->nz + k;
}

void write_vtk(const char *filename, const Field *f, const Domain *d, int step) {
    char local_filename[512];
    snprintf(local_filename, sizeof(local_filename), "%s.%d.vtu", filename, d->rank);

    FILE *fp = fopen(local_filename, "w");
    if (!fp) {
        fprintf(stderr, "Rank %d: Cannot open file %s\n", d->rank, local_filename);
        return;
    }

    long npoints = (long)d->local_nx * d->local_ny * d->nz;

    fprintf(fp, "<?xml version=\"1.0\"?>\n");
    fprintf(fp, "<VTKFile type=\"RectilinearGrid\" version=\"0.1\" byte_order=\"LittleEndian\">\n");
    fprintf(fp, "  <RectilinearGrid WholeExtent=\"%d %d %d %d %d %d\" "
            "GhostLevel=\"0\">\n",
            d->local_x_start, d->local_x_start + d->local_nx - 1,
            d->local_y_start, d->local_y_start + d->local_ny - 1,
            0, d->nz - 1);
    fprintf(fp, "    <Piece Extent=\"%d %d %d %d %d %d\">\n",
            d->local_x_start, d->local_x_start + d->local_nx - 1,
            d->local_y_start, d->local_y_start + d->local_ny - 1,
            0, d->nz - 1);

    fprintf(fp, "      <PointData Scalars=\"Temperature\" Vectors=\"Velocity\">\n");

    fprintf(fp, "        <DataArray type=\"Float64\" Name=\"Temperature\" format=\"ascii\">\n");
    for (int i = 0; i < d->local_nx; i++) {
        for (int j = 0; j < d->local_ny; j++) {
            for (int k = 0; k < d->nz; k++) {
                long idx = idx3d(i, j, k, d);
                fprintf(fp, " %.6e", f->temperature[idx]);
            }
        }
    }
    fprintf(fp, "\n        </DataArray>\n");

    fprintf(fp, "        <DataArray type=\"Float64\" Name=\"Velocity\" NumberOfComponents=\"3\" format=\"ascii\">\n");
    for (int i = 0; i < d->local_nx; i++) {
        for (int j = 0; j < d->local_ny; j++) {
            for (int k = 0; k < d->nz; k++) {
                long idx = idx3d(i, j, k, d);
                fprintf(fp, " %.6e %.6e %.6e", f->u[idx], f->v[idx], f->w[idx]);
            }
        }
    }
    fprintf(fp, "\n        </DataArray>\n");

    fprintf(fp, "      </PointData>\n");

    fprintf(fp, "      <Coordinates>\n");

    fprintf(fp, "        <DataArray type=\"Float64\" Name=\"X\" format=\"ascii\">\n");
    for (int i = 0; i < d->local_nx; i++) {
        double x = 2.0 * M_PI * (d->local_x_start + i) / d->nx;
        fprintf(fp, " %.6e", x);
    }
    fprintf(fp, "\n        </DataArray>\n");

    fprintf(fp, "        <DataArray type=\"Float64\" Name=\"Y\" format=\"ascii\">\n");
    for (int j = 0; j < d->local_ny; j++) {
        double y = 2.0 * M_PI * (d->local_y_start + j) / d->ny;
        fprintf(fp, " %.6e", y);
    }
    fprintf(fp, "\n        </DataArray>\n");

    fprintf(fp, "        <DataArray type=\"Float64\" Name=\"Z\" format=\"ascii\">\n");
    for (int k = 0; k < d->nz; k++) {
        double z = (double)k / (d->nz - 1);
        fprintf(fp, " %.6e", z);
    }
    fprintf(fp, "\n        </DataArray>\n");

    fprintf(fp, "      </Coordinates>\n");
    fprintf(fp, "    </Piece>\n");
    fprintf(fp, "  </RectilinearGrid>\n");
    fprintf(fp, "</VTKFile>\n");

    fclose(fp);

    if (d->rank == 0) {
        char meta_filename[512];
        snprintf(meta_filename, sizeof(meta_filename), "%s_%d.pvtu", filename, step);

        FILE *mfp = fopen(meta_filename, "w");
        if (!mfp) {
            fprintf(stderr, "Rank 0: Cannot create meta file %s\n", meta_filename);
            return;
        }

        fprintf(mfp, "<?xml version=\"1.0\"?>\n");
        fprintf(mfp, "<VTKFile type=\"PRectilinearGrid\" version=\"0.1\" byte_order=\"LittleEndian\">\n");
        fprintf(mfp, "  <PRectilinearGrid WholeExtent=\"%d %d %d %d %d %d\" GhostLevel=\"0\">\n",
                0, d->nx - 1, 0, d->ny - 1, 0, d->nz - 1);
        fprintf(mfp, "    <PPointData Scalars=\"Temperature\" Vectors=\"Velocity\">\n");
        fprintf(mfp, "      <PDataArray type=\"Float64\" Name=\"Temperature\"/>\n");
        fprintf(mfp, "      <PDataArray type=\"Float64\" Name=\"Velocity\" NumberOfComponents=\"3\"/>\n");
        fprintf(mfp, "    </PPointData>\n");
        fprintf(mfp, "    <PCoordinates>\n");
        fprintf(mfp, "      <PDataArray type=\"Float64\" Name=\"X\"/>\n");
        fprintf(mfp, "      <PDataArray type=\"Float64\" Name=\"Y\"/>\n");
        fprintf(mfp, "      <PDataArray type=\"Float64\" Name=\"Z\"/>\n");
        fprintf(mfp, "    </PCoordinates>\n");

        for (int r = 0; r < d->size; r++) {
            char piece_filename[512];
            snprintf(piece_filename, sizeof(piece_filename), "%s.%d.vtu", filename, r);

            int rank_coords[2];
            MPI_Cart_coords(d->cart_comm, r, 2, rank_coords);

            int nx_start, ny_start, nx_local, ny_local;
            int base_x = d->nx / d->px;
            int rem_x = d->nx % d->px;
            int base_y = d->ny / d->py;
            int rem_y = d->ny % d->py;

            nx_local = (rank_coords[0] < rem_x) ? (base_x + 1) : base_x;
            ny_local = (rank_coords[1] < rem_y) ? (base_y + 1) : base_y;
            nx_start = (rank_coords[0] < rem_x) ?
                       rank_coords[0] * (base_x + 1) :
                       rem_x * (base_x + 1) + (rank_coords[0] - rem_x) * base_x;
            ny_start = (rank_coords[1] < rem_y) ?
                       rank_coords[1] * (base_y + 1) :
                       rem_y * (base_y + 1) + (rank_coords[1] - rem_y) * base_y;

            fprintf(mfp, "    <Piece Extent=\"%d %d %d %d %d %d\" Source=\"%s\"/>\n",
                    nx_start, nx_start + nx_local - 1,
                    ny_start, ny_start + ny_local - 1,
                    0, d->nz - 1,
                    piece_filename);
        }

        fprintf(mfp, "  </PRectilinearGrid>\n");
        fprintf(mfp, "</VTKFile>\n");
        fclose(mfp);

        printf("VTK output written: %s_%d.pvtu\n", filename, step);
    }
}
