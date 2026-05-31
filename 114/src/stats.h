#pragma once

#include "types.h"
#include <map>
#include <vector>
#include <algorithm>

struct InstrStats {
    u64 count = 0;
    std::string mnemonic;
};

class Stats {
public:
    void record(const Instruction& instr);
    void record_by_addr(u32 addr, const std::string& mnemonic);

    void print_top(std::ostream& os, size_t n = 10) const;
    u64 total() const { return total_; }

    const std::map<std::string, InstrStats>& by_mnemonic() const { return by_mnemonic_; }
    const std::map<u32, InstrStats>& by_addr() const { return by_addr_; }

private:
    std::map<std::string, InstrStats> by_mnemonic_;
    std::map<u32, InstrStats> by_addr_;
    u64 total_ = 0;
};
