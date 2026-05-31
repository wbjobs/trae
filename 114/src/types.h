#pragma once

#include <cstdint>
#include <cstddef>
#include <string>
#include <vector>
#include <map>
#include <algorithm>
#include <iostream>
#include <sstream>
#include <iomanip>
#include <fstream>
#include <cstring>
#include <cassert>
#include <optional>
#include <variant>
#include <array>
#include <bitset>

using u8   = uint8_t;
using u16  = uint16_t;
using u32  = uint32_t;
using u64  = uint64_t;
using i8   = int8_t;
using i16  = int16_t;
using i32  = int32_t;
using i64  = int64_t;

constexpr u32 REG_ZERO = 0;
constexpr u32 REG_RA   = 1;
constexpr u32 REG_SP   = 2;
constexpr u32 REG_GP   = 3;
constexpr u32 REG_TP   = 4;
constexpr u32 REG_T0   = 5;
constexpr u32 REG_T1   = 6;
constexpr u32 REG_T2   = 7;
constexpr u32 REG_S0   = 8;
constexpr u32 REG_S1   = 9;
constexpr u32 REG_A0   = 10;
constexpr u32 REG_A1   = 11;
constexpr u32 REG_A2   = 12;
constexpr u32 REG_A3   = 13;
constexpr u32 REG_A4   = 14;
constexpr u32 REG_A5   = 15;
constexpr u32 REG_A6   = 16;
constexpr u32 REG_A7   = 17;
constexpr u32 REG_S2   = 18;
constexpr u32 REG_S3   = 19;
constexpr u32 REG_S4   = 20;
constexpr u32 REG_S5   = 21;
constexpr u32 REG_S6   = 22;
constexpr u32 REG_S7   = 23;
constexpr u32 REG_S8   = 24;
constexpr u32 REG_S9   = 25;
constexpr u32 REG_S10  = 26;
constexpr u32 REG_S11  = 27;
constexpr u32 REG_T3   = 28;
constexpr u32 REG_T4   = 29;
constexpr u32 REG_T5   = 30;
constexpr u32 REG_T6   = 31;
constexpr u32 NUM_REGS = 32;

constexpr u32 MEMORY_SIZE  = 256 * 1024 * 1024;
constexpr u32 MEMORY_BASE  = 0x00000000;
constexpr u32 STACK_TOP    = 0x08000000;
constexpr u32 STACK_SIZE   = 16 * 1024 * 1024;

enum class Opcode : u32 {
    LUI       = 0x37,
    AUIPC     = 0x17,
    JAL       = 0x6F,
    JALR      = 0x67,
    BRANCH    = 0x63,
    LOAD      = 0x03,
    STORE     = 0x23,
    OP_IMM    = 0x13,
    OP        = 0x33,
    MISC_MEM  = 0x0F,
    SYSTEM    = 0x73,
    OP_IMM_32 = 0x1B,
    OP_32     = 0x3B,
};

enum class Funct3 : u32 {
    BEQ     = 0x0,
    BNE     = 0x1,
    BLT     = 0x4,
    BGE     = 0x5,
    BLTU    = 0x6,
    BGEU    = 0x7,
    LB      = 0x0,
    LH      = 0x1,
    LW      = 0x2,
    LBU     = 0x4,
    LHU     = 0x5,
    SB      = 0x0,
    SH      = 0x1,
    SW      = 0x2,
    ADDI    = 0x0,
    SLLI    = 0x1,
    SLTI    = 0x2,
    SLTIU   = 0x3,
    XORI    = 0x4,
    SRXI    = 0x5,
    ORI     = 0x6,
    ANDI    = 0x7,
    ADD     = 0x0,
    SLL     = 0x1,
    SLT     = 0x2,
    SLTU    = 0x3,
    XOR     = 0x4,
    SRX     = 0x5,
    OR      = 0x6,
    AND     = 0x7,
    FENCE   = 0x0,
    ECALL_EBREAK = 0x0,
};

enum class Funct7 : u32 {
    DEFAULT   = 0x00,
    SUB_SRA   = 0x20,
    MULDIV    = 0x01,
};

struct Instruction {
    u32 raw;
    u32 opcode;
    u32 rd;
    u32 funct3;
    u32 rs1;
    u32 rs2;
    u32 funct7;
    i32 imm_i;
    i32 imm_s;
    i32 imm_b;
    u32 imm_u;
    i32 imm_j;
    std::string mnemonic;
};

enum class HaltReason {
    NONE,
    ECALL,
    EBREAK,
    MEMORY_ERROR,
    INVALID_INSTRUCTION,
    INFINITE_LOOP,
};
