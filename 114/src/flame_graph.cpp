#include "flame_graph.h"
#include <sstream>
#include <fstream>
#include <algorithm>
#include <cstdio>

static std::string pick_color(double ratio) {
    int hue = static_cast<int>(240.0 * (1.0 - ratio));
    char buf[32];
    std::snprintf(buf, sizeof(buf), "hsl(%d, 80%%, 55%%)", hue);
    return buf;
}

void FlameGraph::generate(const Stats& stats,
                          const std::string& filename,
                          const std::map<u32, std::string>& addr_labels) {
    std::ofstream ofs(filename);
    if (!ofs) return;

    std::vector<std::pair<std::string, u64>> items;
    for (const auto& [key, val] : stats.by_mnemonic()) {
        items.emplace_back(key, val.count);
    }
    std::sort(items.begin(), items.end(),
              [](const auto& a, const auto& b) { return a.second > b.second; });

    if (items.empty()) {
        ofs << "<svg xmlns='http://www.w3.org/2000/svg' width='800' height='100'>"
            << "<text x='10' y='50' font-size='16'>No data</text></svg>";
        return;
    }

    u64 total = stats.total();
    if (total == 0) total = 1;

    const double bar_height = 28.0;
    const double padding = 4.0;
    const double label_width = 180.0;
    const double value_width = 120.0;
    const double max_bar_width = 600.0;
    const double width = label_width + value_width + max_bar_width + 40.0;
    const double height = items.size() * (bar_height + padding) + 80.0;

    ofs << "<?xml version='1.0' encoding='UTF-8'?>\n";
    ofs << "<svg xmlns='http://www.w3.org/2000/svg' width='" << width
        << "' height='" << height << "' font-family='monospace' font-size='13'>\n";

    ofs << "<rect x='0' y='0' width='" << width << "' height='" << height
        << "' fill='#1e1e2e'/>\n";

    ofs << "<text x='20' y='35' font-size='20' fill='#cdd6f4' font-weight='bold'>"
        << "RV32IM Instruction Hotness - Top " << items.size() << "</text>\n";
    ofs << "<text x='20' y='55' font-size='13' fill='#a6adc8'>"
        << "Total instructions: " << total << "</text>\n";

    double y = 75.0;
    u64 max_count = items.front().second;
    if (max_count == 0) max_count = 1;

    for (const auto& [mnemonic, count] : items) {
        double ratio = static_cast<double>(count) / static_cast<double>(max_count);
        double bar_w = max_bar_width * ratio;
        double pct = 100.0 * count / total;

        ofs << "<rect x='" << label_width << "' y='" << y
            << "' width='" << bar_w << "' height='" << bar_height
            << "' fill='" << pick_color(ratio) << "' rx='3'/>\n";

        ofs << "<text x='10' y='" << (y + bar_height - 8)
            << "' fill='#cdd6f4' text-anchor='start'>"
            << mnemonic << "</text>\n";

        char val_buf[64];
        std::snprintf(val_buf, sizeof(val_buf), "%llu (%.2f%%)",
                      static_cast<unsigned long long>(count), pct);
        ofs << "<text x='" << (label_width + value_width - 10) << "' y='"
            << (y + bar_height - 8) << "' fill='#cdd6f4' text-anchor='end'>"
            << val_buf << "</text>\n";

        y += bar_height + padding;
    }

    if (!addr_labels.empty()) {
        y += 20.0;
        ofs << "<text x='20' y='" << y
            << "' font-size='16' fill='#cdd6f4' font-weight='bold'>"
            << "By Address (Top 20)</text>\n";
        y += 20.0;

        std::vector<std::pair<u32, u64>> addr_items;
        for (const auto& [addr, val] : stats.by_addr()) {
            addr_items.emplace_back(addr, val.count);
        }
        std::sort(addr_items.begin(), addr_items.end(),
                  [](const auto& a, const auto& b) { return a.second > b.second; });

        size_t addr_limit = std::min(size_t(20), addr_items.size());
        u64 addr_max = addr_items.empty() ? 1 : addr_items.front().second;
        if (addr_max == 0) addr_max = 1;

        for (size_t i = 0; i < addr_limit; ++i) {
            u32 addr = addr_items[i].first;
            u64 cnt = addr_items[i].second;
            double ratio = static_cast<double>(cnt) / static_cast<double>(addr_max);
            double bar_w = max_bar_width * ratio;
            double pct = 100.0 * cnt / total;

            std::string label;
            auto it = addr_labels.find(addr);
            if (it != addr_labels.end()) {
                label = it->second;
            } else {
                char addr_buf[16];
                std::snprintf(addr_buf, sizeof(addr_buf), "0x%08x", addr);
                label = addr_buf;
            }

            ofs << "<rect x='" << label_width << "' y='" << y
                << "' width='" << bar_w << "' height='" << bar_height
                << "' fill='" << pick_color(ratio) << "' rx='3'/>\n";

            ofs << "<text x='10' y='" << (y + bar_height - 8)
                << "' fill='#cdd6f4'>" << label << "</text>\n";

            char val_buf[64];
            std::snprintf(val_buf, sizeof(val_buf), "%llu (%.2f%%)",
                          static_cast<unsigned long long>(cnt), pct);
            ofs << "<text x='" << (label_width + value_width - 10) << "' y='"
                << (y + bar_height - 8) << "' fill='#cdd6f4' text-anchor='end'>"
                << val_buf << "</text>\n";

            y += bar_height + padding;
        }
    }

    ofs << "</svg>\n";
    ofs.close();
    std::cout << "Flame graph saved to: " << filename << std::endl;
}
