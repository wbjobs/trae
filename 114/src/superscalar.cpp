#include "superscalar.h"
#include <iomanip>

Superscalar::Superscalar(u32 issue_width)
    : issue_width_(issue_width)
    , cycles_(0)
    , instructions_(0)
    , dual_issue_cycles_(0)
    , single_issue_cycles_(0)
{
}

RegMask Superscalar::analyze_regs(const Instruction& instr) const {
    RegMask mask;
    mask.reads.reset();
    mask.writes.reset();

    switch (static_cast<Opcode>(instr.opcode)) {
        case Opcode::LUI:
        case Opcode::AUIPC:
            mask.writes.set(instr.rd);
            break;
        case Opcode::JAL:
            mask.writes.set(instr.rd);
            break;
        case Opcode::JALR:
            mask.writes.set(instr.rd);
            mask.reads.set(instr.rs1);
            break;
        case Opcode::BRANCH:
            mask.reads.set(instr.rs1);
            mask.reads.set(instr.rs2);
            break;
        case Opcode::LOAD:
            mask.writes.set(instr.rd);
            mask.reads.set(instr.rs1);
            break;
        case Opcode::STORE:
            mask.reads.set(instr.rs1);
            mask.reads.set(instr.rs2);
            break;
        case Opcode::OP_IMM:
            mask.writes.set(instr.rd);
            mask.reads.set(instr.rs1);
            break;
        case Opcode::OP:
            mask.writes.set(instr.rd);
            mask.reads.set(instr.rs1);
            mask.reads.set(instr.rs2);
            break;
        case Opcode::MISC_MEM:
            break;
        case Opcode::SYSTEM:
            break;
        default:
            break;
    }

    return mask;
}

bool Superscalar::can_pair(const Instruction& instr1,
                            const Instruction& instr2) const {
    if (instr2.opcode == 0 || instr2.raw == 0)
        return false;

    if (static_cast<Opcode>(instr1.opcode) == Opcode::SYSTEM ||
        static_cast<Opcode>(instr2.opcode) == Opcode::SYSTEM)
        return false;

    if (static_cast<Opcode>(instr1.opcode) == Opcode::BRANCH)
        return false;

    if (static_cast<Opcode>(instr1.opcode) == Opcode::JAL ||
        static_cast<Opcode>(instr1.opcode) == Opcode::JALR)
        return false;

    RegMask mask1 = analyze_regs(instr1);
    RegMask mask2 = analyze_regs(instr2);

    if ((mask1.writes & mask2.reads).any())
        return false;

    if ((mask1.writes & mask2.writes).any())
        return false;

    if ((mask1.reads & mask2.writes).any())
        return false;

    return true;
}

void Superscalar::reset() {
    cycles_ = 0;
    instructions_ = 0;
    dual_issue_cycles_ = 0;
    single_issue_cycles_ = 0;
}

void Superscalar::record_cycle(u32 issued_count) {
    ++cycles_;
    instructions_ += issued_count;
    if (issued_count >= 2)
        ++dual_issue_cycles_;
    else
        ++single_issue_cycles_;
}

double Superscalar::ipc() const {
    if (cycles_ == 0) return 0.0;
    return static_cast<double>(instructions_) / static_cast<double>(cycles_);
}

double Superscalar::scalar_speedup() const {
    if (instructions_ == 0) return 1.0;
    return static_cast<double>(instructions_) / static_cast<double>(cycles_);
}

void Superscalar::print_stats(std::ostream& os, u64 scalar_cycles) const {
    os << "\n=== Superscalar Dual-Issue Statistics ===" << std::endl;
    os << "  Issue width:         " << issue_width_ << std::endl;
    os << "  Total cycles:        " << cycles_ << std::endl;
    os << "  Total instructions:  " << instructions_ << std::endl;
    os << "  Dual-issue cycles:   " << dual_issue_cycles_
       << " (" << std::fixed << std::setprecision(1)
       << (cycles_ > 0 ? 100.0 * dual_issue_cycles_ / cycles_ : 0.0)
       << "%)" << std::endl;
    os << "  Single-issue cycles: " << single_issue_cycles_
       << " (" << std::fixed << std::setprecision(1)
       << (cycles_ > 0 ? 100.0 * single_issue_cycles_ / cycles_ : 0.0)
       << "%)" << std::endl;
    os << "  IPC:                 " << std::fixed << std::setprecision(4)
       << ipc() << std::endl;
    os << "  Speedup vs scalar:   " << std::fixed << std::setprecision(2)
       << scalar_speedup() << "x" << std::endl;
    if (scalar_cycles > 0) {
        double speedup = static_cast<double>(scalar_cycles) /
                         static_cast<double>(cycles_);
        os << "  vs scalar cycles:    " << scalar_cycles
           << " → speedup " << std::fixed << std::setprecision(2)
           << speedup << "x" << std::endl;
    }
}
