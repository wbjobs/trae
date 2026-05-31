#include "stats.h"

void Stats::record(const Instruction& instr) {
    ++total_;
    auto& s = by_mnemonic_[instr.mnemonic];
    s.count++;
    s.mnemonic = instr.mnemonic;
}

void Stats::record_by_addr(u32 addr, const std::string& mnemonic) {
    auto& s = by_addr_[addr];
    s.count++;
    s.mnemonic = mnemonic;
}

void Stats::print_top(std::ostream& os, size_t n) const {
    std::vector<std::pair<std::string, u64>> sorted;
    for (const auto& [key, val] : by_mnemonic_) {
        sorted.emplace_back(key, val.count);
    }
    std::sort(sorted.begin(), sorted.end(),
              [](const auto& a, const auto& b) { return a.second > b.second; });

    os << "\n=== Top " << n << " Hot Instructions ===" << std::endl;
    os << std::left << std::setw(8) << "Rank"
       << std::setw(20) << "Mnemonic"
       << std::setw(15) << "Count"
       << std::setw(10) << "Percent" << std::endl;
    os << std::string(55, '-') << std::endl;

    size_t limit = std::min(n, sorted.size());
    for (size_t i = 0; i < limit; ++i) {
        double pct = total_ > 0 ? (100.0 * sorted[i].second / total_) : 0.0;
        os << std::left << std::setw(8) << (i + 1)
           << std::setw(20) << sorted[i].first
           << std::setw(15) << sorted[i].second
           << std::fixed << std::setprecision(2) << std::setw(10) << pct << "%"
           << std::dec << std::endl;
    }
    os << "\nTotal instructions executed: " << total_ << std::endl;
}
