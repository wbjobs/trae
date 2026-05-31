#pragma once

#include "types.h"

class CpuState {
public:
    CpuState();
    ~CpuState() = default;

    void reset(u32 entry_point);

    u32 reg(u32 idx) const;
    void set_reg(u32 idx, u32 val);

    u32 pc() const { return pc_; }
    void set_pc(u32 val) { pc_ = val; }

    u32 read_mem_u8(u32 addr) const;
    u32 read_mem_u16(u32 addr) const;
    u32 read_mem_u32(u32 addr) const;
    i32 read_mem_s8(u32 addr) const;
    i32 read_mem_s16(u32 addr) const;

    void write_mem_u8(u32 addr, u8 val);
    void write_mem_u16(u32 addr, u16 val);
    void write_mem_u32(u32 addr, u32 val);

    void load_section(u32 addr, const void* data, u32 size);

    void dump_registers() const;

    HaltReason halt_reason() const { return halt_reason_; }
    void set_halt(HaltReason r) { halt_reason_ = r; }
    bool is_halted() const { return halt_reason_ != HaltReason::NONE; }

    u8* memory_ptr(u32 addr) {
        if (addr >= MEMORY_SIZE) return nullptr;
        return &memory_[addr];
    }

    u32 read_instr(u32 addr) const {
        if (addr + 4 > MEMORY_SIZE) return 0;
        return memory_[addr]
             | (memory_[addr + 1] << 8)
             | (memory_[addr + 2] << 16)
             | (memory_[addr + 3] << 24);
    }

private:
    u32 regs_[NUM_REGS];
    u32 pc_;
    std::vector<u8> memory_;
    HaltReason halt_reason_;
};
