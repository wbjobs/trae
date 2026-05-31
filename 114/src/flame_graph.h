#pragma once

#include "stats.h"
#include <string>

class FlameGraph {
public:
    static void generate(const Stats& stats,
                         const std::string& filename,
                         const std::map<u32, std::string>& addr_labels = {});
};
