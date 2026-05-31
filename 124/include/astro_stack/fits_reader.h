#pragma once

#include "astro_stack/types.h"
#include <string>
#include <vector>

namespace astro_stack {

class FitsReader {
public:
    static Image read(const std::string& filepath);
    static std::vector<Image> readBatch(const std::vector<std::string>& filepaths,
                                         ProgressCallback callback = nullptr);
    static void write(const std::string& filepath, const Image& image);
};

} // namespace astro_stack
