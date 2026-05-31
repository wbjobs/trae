#include "cpu_state.h"

CpuState::CpuState()
    : pc_(0)
    , memory_(MEMORY_SIZE, 0)
    , halt_reason_(HaltReason::NONE)
{
    std::memset(regs_, 0, sizeof(regs_));
}

void CpuState::reset(u32 entry_point) {
    std::memset(regs_, 0, sizeof(regs_));
    regs_[REG_SP] = STACK_TOP;
    regs_[REG_ZERO] = 0;
    pc_ = entry_point;
    halt_reason_ = HaltReason::NONE;
}

u32 CpuState::reg(u32 idx) const {
    return regs_[idx & 0x1F];
}

void CpuState::set_reg(u32 idx, u32 val) {
    idx &= 0x1F;
    if (idx == REG_ZERO) return;
    regs_[idx] = val;
}

u32 CpuState::read_mem_u8(u32 addr) const {
    if (addr >= MEMORY_SIZE) return 0;
    return memory_[addr];
}

u32 CpuState::read_mem_u16(u32 addr) const {
    if (addr + 2 > MEMORY_SIZE) return 0;
    return memory_[addr] | (memory_[addr + 1] << 8);
}

u32 CpuState::read_mem_u32(u32 addr) const {
    if (addr + 4 > MEMORY_SIZE) return 0;
    return memory_[addr]
         | (memory_[addr + 1] << 8)
         | (memory_[addr + 2] << 16)
         | (memory_[addr + 3] << 24);
}

i32 CpuState::read_mem_s8(u32 addr) const {
    return static_cast<i32>(static_cast<i8>(read_mem_u8(addr)));
}

i32 CpuState::read_mem_s16(u32 addr) const {
    return static_cast<i32>(static_cast<i16>(read_mem_u16(addr)));
}

void CpuState::write_mem_u8(u32 addr, u8 val) {
    if (addr >= MEMORY_SIZE) return;
    memory_[addr] = val;
}

void CpuState::write_mem_u16(u32 addr, u16 val) {
    if (addr + 2 > MEMORY_SIZE) return;
    memory_[addr]     = val & 0xFF;
    memory_[addr + 1] = (val >> 8) & 0xFF;
}

void CpuState::write_mem_u32(u32 addr, u32 val) {
    if (addr + 4 > MEMORY_SIZE) return;
    memory_[addr]     = val & 0xFF;
    memory_[addr + 1] = (val >> 8) & 0xFF;
    memory_[addr + 2] = (val >> 16) & 0xFF;
    memory_[addr + 3] = (val >> 24) & 0xFF;
}

void CpuState::load_section(u32 addr, const void* data, u32 size) {
    if (addr + size > MEMORY_SIZE) return;
    std::memcpy(memory_.data() + addr, data, size);
}

void CpuState::dump_registers() const {
    static const char* reg_names[NUM_REGS] = {
        "zero", "ra", "sp", "gp", "tp", "t0", "t1", "t2",
        "s0",   "s1", "a0", "a1", "a2", "a3", "a4", "a5",
        "a6",   "a7", "s2", "s3", "s4", "s5", "s6", "s7",
        "s8",   "s9", "s10","s11","t3", "t4", "t5", "t6"
    };

    std::cout << "Registers:" << std::endl;
    for (u32 i = 0; i < NUM_REGS; i += 4) {
        for (u32 j = 0; j < 4 && (i + j) < NUM_REGS; ++j) {
            u32 idx = i + j;
            std::cout << "  " << std::left << std::setw(6) << reg_names[idx]
                      << "=0x" << std::hex << std::setw(8) << std::setfill('0') << regs_[idx]
                      << std::dec << std::setfill(' ') << "  ";
        }
        std::cout << std::endl;
    }
    std::cout << "  pc    =0x" << std::hex << std::setw(8) << std::setfill('0') << pc_
              << std::dec << std::setfill(' ') << std::endl;
}
