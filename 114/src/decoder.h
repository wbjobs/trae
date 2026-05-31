#pragma once

#include "types.h"

class Decoder {
public:
    static Instruction decode(u32 raw);

private:
    static i32 sign_extend(u32 val, u32 bits);
    static std::string get_mnemonic(const Instruction& instr);
};
