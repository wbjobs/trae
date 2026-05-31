#include "executor.h"

Executor::Executor(CpuState& cpu)
    : cpu_(cpu)
    , total_cycles_(0)
    , side_effect_(false)
{
}

void Executor::execute(const Instruction& instr) {
    ++total_cycles_;

    switch (static_cast<Opcode>(instr.opcode)) {
        case Opcode::LUI:       exec_lui(instr); break;
        case Opcode::AUIPC:     exec_auipc(instr); break;
        case Opcode::JAL:       exec_jal(instr); break;
        case Opcode::JALR:      exec_jalr(instr); break;
        case Opcode::BRANCH:    exec_branch(instr); break;
        case Opcode::LOAD:      exec_load(instr); break;
        case Opcode::STORE:     exec_store(instr); break;
        case Opcode::OP_IMM:    exec_op_imm(instr); break;
        case Opcode::OP:        exec_op(instr); break;
        case Opcode::MISC_MEM:  exec_fence(instr); break;
        case Opcode::SYSTEM:    exec_system(instr); break;
        default:
            cpu_.set_halt(HaltReason::INVALID_INSTRUCTION);
            break;
    }
}

void Executor::exec_lui(const Instruction& instr) {
    cpu_.set_reg(instr.rd, instr.imm_u);
    cpu_.set_pc(cpu_.pc() + 4);
}

void Executor::exec_auipc(const Instruction& instr) {
    cpu_.set_reg(instr.rd, cpu_.pc() + instr.imm_u);
    cpu_.set_pc(cpu_.pc() + 4);
}

void Executor::exec_jal(const Instruction& instr) {
    u32 next_pc = cpu_.pc() + 4;
    cpu_.set_reg(instr.rd, next_pc);
    cpu_.set_pc(cpu_.pc() + instr.imm_j);
}

void Executor::exec_jalr(const Instruction& instr) {
    u32 next_pc = cpu_.pc() + 4;
    u32 target = (cpu_.reg(instr.rs1) + instr.imm_i) & ~1u;
    cpu_.set_reg(instr.rd, next_pc);
    cpu_.set_pc(target);
}

void Executor::exec_branch(const Instruction& instr) {
    u32 rs1 = cpu_.reg(instr.rs1);
    u32 rs2 = cpu_.reg(instr.rs2);
    bool taken = false;

    switch (static_cast<Funct3>(instr.funct3)) {
        case Funct3::BEQ:  taken = (rs1 == rs2); break;
        case Funct3::BNE:  taken = (rs1 != rs2); break;
        case Funct3::BLT:  taken = (static_cast<i32>(rs1) < static_cast<i32>(rs2)); break;
        case Funct3::BGE:  taken = (static_cast<i32>(rs1) >= static_cast<i32>(rs2)); break;
        case Funct3::BLTU: taken = (rs1 < rs2); break;
        case Funct3::BGEU: taken = (rs1 >= rs2); break;
        default: break;
    }

    if (taken)
        cpu_.set_pc(cpu_.pc() + instr.imm_b);
    else
        cpu_.set_pc(cpu_.pc() + 4);
}

void Executor::exec_load(const Instruction& instr) {
    u32 addr = cpu_.reg(instr.rs1) + instr.imm_i;
    u32 val = 0;

    switch (static_cast<Funct3>(instr.funct3)) {
        case Funct3::LB:  val = static_cast<u32>(cpu_.read_mem_s8(addr)); break;
        case Funct3::LH:  val = static_cast<u32>(cpu_.read_mem_s16(addr)); break;
        case Funct3::LW:  val = cpu_.read_mem_u32(addr); break;
        case Funct3::LBU: val = cpu_.read_mem_u8(addr); break;
        case Funct3::LHU: val = cpu_.read_mem_u16(addr); break;
        default: break;
    }

    cpu_.set_reg(instr.rd, val);
    cpu_.set_pc(cpu_.pc() + 4);
}

void Executor::exec_store(const Instruction& instr) {
    u32 addr = cpu_.reg(instr.rs1) + instr.imm_s;
    u32 val = cpu_.reg(instr.rs2);

    side_effect_ = true;

    switch (static_cast<Funct3>(instr.funct3)) {
        case Funct3::SB: cpu_.write_mem_u8(addr, val & 0xFF); break;
        case Funct3::SH: cpu_.write_mem_u16(addr, val & 0xFFFF); break;
        case Funct3::SW: cpu_.write_mem_u32(addr, val); break;
        default: break;
    }

    cpu_.set_pc(cpu_.pc() + 4);
}

void Executor::exec_op_imm(const Instruction& instr) {
    u32 rs1 = cpu_.reg(instr.rs1);
    u32 result = 0;

    switch (static_cast<Funct3>(instr.funct3)) {
        case Funct3::ADDI:
            result = rs1 + instr.imm_i;
            break;
        case Funct3::SLLI:
            result = rs1 << shift_amount(instr.imm_i);
            break;
        case Funct3::SLTI:
            result = (static_cast<i32>(rs1) < instr.imm_i) ? 1 : 0;
            break;
        case Funct3::SLTIU:
            result = (rs1 < static_cast<u32>(instr.imm_i)) ? 1 : 0;
            break;
        case Funct3::XORI:
            result = rs1 ^ instr.imm_i;
            break;
        case Funct3::SRXI:
            if (instr.funct7 == 0x20)
                result = static_cast<u32>(static_cast<i32>(rs1) >> shift_amount(instr.imm_i));
            else
                result = rs1 >> shift_amount(instr.imm_i);
            break;
        case Funct3::ORI:
            result = rs1 | instr.imm_i;
            break;
        case Funct3::ANDI:
            result = rs1 & instr.imm_i;
            break;
        default: break;
    }

    cpu_.set_reg(instr.rd, result);
    cpu_.set_pc(cpu_.pc() + 4);
}

void Executor::exec_op(const Instruction& instr) {
    u32 rs1 = cpu_.reg(instr.rs1);
    u32 rs2 = cpu_.reg(instr.rs2);
    u32 result = 0;

    if (instr.funct7 == 0x01) {
        i64 srs1 = static_cast<i64>(static_cast<i32>(rs1));
        i64 srs2 = static_cast<i64>(static_cast<i32>(rs2));
        u64 urs1 = rs1;
        u64 urs2 = rs2;

        switch (instr.funct3) {
            case 0x0:
                result = static_cast<u32>(srs1 * srs2);
                break;
            case 0x1:
                result = static_cast<u32>((srs1 * srs2) >> 32);
                break;
            case 0x2:
                result = static_cast<u32>((srs1 * static_cast<i64>(rs2)) >> 32);
                break;
            case 0x3:
                result = static_cast<u32>((urs1 * urs2) >> 32);
                break;
            case 0x4:
                if (srs2 == 0)
                    result = 0xFFFFFFFF;
                else
                    result = static_cast<u32>(srs1 / srs2);
                break;
            case 0x5:
                if (urs2 == 0)
                    result = 0xFFFFFFFF;
                else
                    result = static_cast<u32>(urs1 / urs2);
                break;
            case 0x6:
                if (srs2 == 0)
                    result = 0xFFFFFFFF;
                else
                    result = static_cast<u32>(srs1 % srs2);
                break;
            case 0x7:
                if (urs2 == 0)
                    result = static_cast<u32>(urs1);
                else
                    result = static_cast<u32>(urs1 % urs2);
                break;
            default: break;
        }
    } else {
        switch (static_cast<Funct3>(instr.funct3)) {
            case Funct3::ADD:
                if (instr.funct7 == 0x20)
                    result = rs1 - rs2;
                else
                    result = rs1 + rs2;
                break;
            case Funct3::SLL:
                result = rs1 << shift_amount(rs2);
                break;
            case Funct3::SLT:
                result = (static_cast<i32>(rs1) < static_cast<i32>(rs2)) ? 1 : 0;
                break;
            case Funct3::SLTU:
                result = (rs1 < rs2) ? 1 : 0;
                break;
            case Funct3::XOR:
                result = rs1 ^ rs2;
                break;
            case Funct3::SRX:
                if (instr.funct7 == 0x20)
                    result = static_cast<u32>(static_cast<i32>(rs1) >> shift_amount(rs2));
                else
                    result = rs1 >> shift_amount(rs2);
                break;
            case Funct3::OR:
                result = rs1 | rs2;
                break;
            case Funct3::AND:
                result = rs1 & rs2;
                break;
            default: break;
        }
    }

    cpu_.set_reg(instr.rd, result);
    cpu_.set_pc(cpu_.pc() + 4);
}

void Executor::exec_fence(const Instruction& instr) {
    (void)instr;
    cpu_.set_pc(cpu_.pc() + 4);
}

void Executor::exec_system(const Instruction& instr) {
    side_effect_ = true;
    if (instr.imm_i == 0x000) {
        cpu_.set_halt(HaltReason::ECALL);
    } else if (instr.imm_i == 0x001) {
        cpu_.set_halt(HaltReason::EBREAK);
    }
    cpu_.set_pc(cpu_.pc() + 4);
}
