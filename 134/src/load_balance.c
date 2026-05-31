#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <string.h>
#include "weather_fft.h"

void load_balance_init(LoadBalancePlan *plan, int size) {
    plan->rank_assignments = (int *)malloc(size * sizeof(int));
    plan->partition_starts = (int *)malloc((size + 1) * sizeof(int));
    plan->partition_sizes = (int *)malloc(size * sizeof(int));
    plan->partition_weights = (double *)malloc(size * sizeof(double));
    plan->num_partitions = size;

    for (int i = 0; i < size; i++) {
        plan->rank_assignments[i] = i;
        plan->partition_sizes[i] = 0;
        plan->partition_weights[i] = 0.0;
    }
    plan->partition_starts[0] = 0;
}

void load_balance_free(LoadBalancePlan *plan) {
    free(plan->rank_assignments);
    free(plan->partition_starts);
    free(plan->partition_sizes);
    free(plan->partition_weights);
    plan->rank_assignments = NULL;
    plan->partition_starts = NULL;
    plan->partition_sizes = NULL;
    plan->partition_weights = NULL;
}

typedef struct {
    int rank;
    double weight;
    int original_x;
    int original_y;
} RankInfo;

static int compare_rank_by_weight(const void *a, const void *b) {
    const RankInfo *ra = (const RankInfo *)a;
    const RankInfo *rb = (const RankInfo *)b;
    if (ra->weight > rb->weight) return -1;
    if (ra->weight < rb->weight) return 1;
    return 0;
}

static void recursive_bisection(RankInfo *ranks, int num_ranks,
                                int *assignments, int current_level,
                                int max_levels, int px, int py) {
    if (num_ranks <= 1 || current_level >= max_levels) {
        for (int i = 0; i < num_ranks; i++) {
            assignments[ranks[i].rank] = current_level;
        }
        return;
    }

    double total_weight = 0.0;
    for (int i = 0; i < num_ranks; i++) {
        total_weight += ranks[i].weight;
    }

    double target_weight = total_weight / 2.0;

    qsort(ranks, num_ranks, sizeof(RankInfo), compare_rank_by_weight);

    double current_weight = 0.0;
    int split_point = 0;
    for (int i = 0; i < num_ranks; i++) {
        if (current_weight + ranks[i].weight <= target_weight || i == 0) {
            current_weight += ranks[i].weight;
            split_point = i + 1;
        } else {
            break;
        }
    }

    if (split_point == 0 || split_point == num_ranks) {
        split_point = num_ranks / 2;
    }

    recursive_bisection(ranks, split_point, assignments,
                       current_level * 2, max_levels, px, py);
    recursive_bisection(ranks + split_point, num_ranks - split_point, assignments,
                       current_level * 2 + 1, max_levels, px, py);
}

static void compute_optimal_partition(LoadBalancePlan *plan,
                                      const LoadProfile *profile,
                                      const Domain *d) {
    int size = d->size;
    RankInfo *ranks = (RankInfo *)malloc(size * sizeof(RankInfo));

    for (int i = 0; i < size; i++) {
        ranks[i].rank = i;
        ranks[i].weight = profile->all_works[i];
        int coords[2];
        MPI_Cart_coords(d->cart_comm, i, 2, coords);
        ranks[i].original_x = coords[0];
        ranks[i].original_y = coords[1];
    }

    int *temp_assignments = (int *)malloc(size * sizeof(int));
    int max_levels = (int)log2(size) + 1;

    recursive_bisection(ranks, size, temp_assignments, 1, max_levels, d->px, d->py);

    for (int i = 0; i < size; i++) {
        plan->rank_assignments[i] = temp_assignments[i];
    }

    int *partition_ids = (int *)malloc(size * sizeof(int));
    int num_partitions = 0;

    for (int i = 0; i < size; i++) {
        int found = -1;
        for (int j = 0; j < num_partitions; j++) {
            if (temp_assignments[i] == partition_ids[j]) {
                found = j;
                break;
            }
        }
        if (found == -1) {
            partition_ids[num_partitions++] = temp_assignments[i];
        }
        plan->rank_assignments[i] = (found == -1) ? num_partitions - 1 : found;
    }

    plan->num_partitions = num_partitions;

    for (int i = 0; i < num_partitions; i++) {
        plan->partition_sizes[i] = 0;
        plan->partition_weights[i] = 0.0;
    }

    for (int i = 0; i < size; i++) {
        int p = plan->rank_assignments[i];
        plan->partition_sizes[p]++;
        plan->partition_weights[p] += profile->all_works[i];
    }

    plan->partition_starts[0] = 0;
    for (int i = 1; i <= num_partitions; i++) {
        plan->partition_starts[i] = plan->partition_starts[i-1] + plan->partition_sizes[i-1];
    }

    free(ranks);
    free(temp_assignments);
    free(partition_ids);
}

void load_balance_compute(LoadBalancePlan *plan, const LoadProfile *profile,
                          const Domain *d, const Config *cfg) {
    if (cfg->use_load_balancing &&
        profile->imbalance_ratio > cfg->load_imbalance_threshold) {

        compute_optimal_partition(plan, profile, d);

        if (d->rank == 0) {
            printf("Load balancing triggered: imbalance ratio = %.2f\n",
                   profile->imbalance_ratio);
        }
    } else {
        for (int i = 0; i < d->size; i++) {
            plan->rank_assignments[i] = i;
        }
        plan->num_partitions = d->size;
        for (int i = 0; i < d->size; i++) {
            plan->partition_sizes[i] = 1;
            plan->partition_weights[i] = profile->all_works[i];
        }
        plan->partition_starts[0] = 0;
        for (int i = 1; i <= d->size; i++) {
            plan->partition_starts[i] = i;
        }
    }
}

void load_balance_print(const LoadBalancePlan *plan, const Domain *d) {
    if (d->rank == 0) {
        printf("=== Load Balance Plan ===\n");
        printf("Number of partitions: %d\n", plan->num_partitions);
        for (int i = 0; i < plan->num_partitions; i++) {
            printf("  Partition %d: %d ranks, weight = %.2f\n",
                   i, plan->partition_sizes[i], plan->partition_weights[i]);
        }
        printf("========================\n");
    }
}
