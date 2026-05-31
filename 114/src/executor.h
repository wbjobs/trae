#pragma once

#include "types.h"
#include "cpu_state.h"
#include "decoder.h"
#include <functional>

class Executor {
public:
    Executor(CpuState& cpu);

    void execute(const Instruction& instr);
    u64 total_cycles() const { return total_cycles_; }
    void reset_cycles() { total_cycles_ = 0; }

    bool had_side_effect() const { return side_effect_; }
    void clear_side_effect() { side_effect_ = false; }

private:
    CpuState& cpu_;
    u64 total_cycles_;
    bool side_effect_;

    void exec_lui(const Instruction& instr);
    void exec_auipc(const Instruction& instr);
    void exec_jal(const Instruction& instr);
    void exec_jalr(const Instruction& instr);
    void exec_branch(const Instruction& instr);
    void exec_load(const Instruction& instr);
    void exec_store(const Instruction& instr);
    void exec_op_imm(const Instruction& instr);
    void exec_op(const Instruction& instr);
    void exec_fence(const Instruction& instr);
    void exec_system(const Instruction& instr);

    u32 shift_amount(u32 val) const { return val & 0x1F; }
};
