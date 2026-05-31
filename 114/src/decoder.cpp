#include "decoder.h"

i32 Decoder::sign_extend(u32 val, u32 bits) {
    if (val & (1u << (bits - 1)))
        val |= ~((1u << bits) - 1);
    return static_cast<i32>(val);
}

Instruction Decoder::decode(u32 raw) {
    Instruction instr;
    instr.raw = raw;
    instr.opcode = raw & 0x7F;
    instr.rd     = (raw >> 7) & 0x1F;
    instr.funct3 = (raw >> 12) & 0x7;
    instr.rs1    = (raw >> 15) & 0x1F;
    instr.rs2    = (raw >> 20) & 0x1F;
    instr.funct7 = (raw >> 25) & 0x7F;

    instr.imm_i = sign_extend((raw >> 20) & 0xFFF, 12);
    instr.imm_s = sign_extend(
        (((raw >> 25) & 0x7F) << 5) | ((raw >> 7) & 0x1F), 12);
    instr.imm_b = sign_extend(
        (((raw >> 31) & 1) << 12) |
        (((raw >> 7) & 1) << 11) |
        (((raw >> 25) & 0x3F) << 5) |
        (((raw >> 8) & 0xF) << 1), 13);
    instr.imm_u = raw & 0xFFFFF000;
    instr.imm_j = sign_extend(
        (((raw >> 31) & 1) << 20) |
        (((raw >> 12) & 0xFF) << 12) |
        (((raw >> 20) & 1) << 11) |
        (((raw >> 21) & 0x3FF) << 1), 21);

    instr.mnemonic = get_mnemonic(instr);
    return instr;
}

std::string Decoder::get_mnemonic(const Instruction& i) {
    switch (static_cast<Opcode>(i.opcode)) {
        case Opcode::LUI:       return "LUI";
        case Opcode::AUIPC:     return "AUIPC";
        case Opcode::JAL:       return "JAL";
        case Opcode::JALR:      return "JALR";
        case Opcode::BRANCH:
            switch (static_cast<Funct3>(i.funct3)) {
                case Funct3::BEQ:  return "BEQ";
                case Funct3::BNE:  return "BNE";
                case Funct3::BLT:  return "BLT";
                case Funct3::BGE:  return "BGE";
                case Funct3::BLTU: return "BLTU";
                case Funct3::BGEU: return "BGEU";
                default:            return "BRANCH(unknown)";
            }
        case Opcode::LOAD:
            switch (static_cast<Funct3>(i.funct3)) {
                case Funct3::LB:  return "LB";
                case Funct3::LH:  return "LH";
                case Funct3::LW:  return "LW";
                case Funct3::LBU: return "LBU";
                case Funct3::LHU: return "LHU";
                default:           return "LOAD(unknown)";
            }
        case Opcode::STORE:
            switch (static_cast<Funct3>(i.funct3)) {
                case Funct3::SB: return "SB";
                case Funct3::SH: return "SH";
                case Funct3::SW: return "SW";
                default:          return "STORE(unknown)";
            }
        case Opcode::OP_IMM:
            switch (static_cast<Funct3>(i.funct3)) {
                case Funct3::ADDI:  return "ADDI";
                case Funct3::SLLI:  return "SLLI";
                case Funct3::SLTI:  return "SLTI";
                case Funct3::SLTIU: return "SLTIU";
                case Funct3::XORI:  return "XORI";
                case Funct3::SRXI:
                    return (i.funct7 == 0x20) ? "SRAI" : "SRLI";
                case Funct3::ORI:   return "ORI";
                case Funct3::ANDI:  return "ANDI";
                default:             return "OP_IMM(unknown)";
            }
        case Opcode::OP: {
            if (i.funct7 == 0x01) {
                switch (static_cast<Funct3>(i.funct3)) {
                    case 0x0: return "MUL";
                    case 0x1: return "MULH";
                    case 0x2: return "MULHSU";
                    case 0x3: return "MULHU";
                    case 0x4: return "DIV";
                    case 0x5: return "DIVU";
                    case 0x6: return "REM";
                    case 0x7: return "REMU";
                }
            }
            switch (static_cast<Funct3>(i.funct3)) {
                case Funct3::ADD:
                    return (i.funct7 == 0x20) ? "SUB" : "ADD";
                case Funct3::SLL:  return "SLL";
                case Funct3::SLT:  return "SLT";
                case Funct3::SLTU: return "SLTU";
                case Funct3::XOR:  return "XOR";
                case Funct3::SRX:
                    return (i.funct7 == 0x20) ? "SRA" : "SRL";
                case Funct3::OR:   return "OR";
                case Funct3::AND:  return "AND";
                default:            return "OP(unknown)";
            }
        }
        case Opcode::MISC_MEM:
            return "FENCE";
        case Opcode::SYSTEM:
            if (i.imm_i == 0x000) return "ECALL";
            if (i.imm_i == 0x001) return "EBREAK";
            return "SYSTEM";
        default:
            return "UNKNOWN";
    }
}
