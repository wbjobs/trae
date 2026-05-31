#pragma once

#include "types.h"
#include "cpu_state.h"
#include "decoder.h"
#include "executor.h"
#include <array>
#include <bitset>

struct RegMask {
    std::bitset<NUM_REGS> reads;
    std::bitset<NUM_REGS> writes;
};

class Superscalar {
public:
    explicit Superscalar(u32 issue_width = 2);

    RegMask analyze_regs(const Instruction& instr) const;

    bool can_pair(const Instruction& instr1, const Instruction& instr2) const;

    void reset();

    void record_cycle(u32 issued_count);

    u64 total_cycles() const { return cycles_; }
    u64 total_instructions() const { return instructions_; }
    u64 dual_issue_cycles() const { return dual_issue_cycles_; }
    u64 single_issue_cycles() const { return single_issue_cycles_; }
    double ipc() const;
    double scalar_speedup() const;

    u32 issue_width() const { return issue_width_; }

    void print_stats(std::ostream& os, u64 scalar_cycles) const;

private:
    u32 issue_width_;
    u64 cycles_;
    u64 instructions_;
    u64 dual_issue_cycles_;
    u64 single_issue_cycles_;
};
