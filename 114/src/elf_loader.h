#pragma once

#include "types.h"
#include <libelf.h>
#include <gelf.h>
#include <fcntl.h>
#include <unistd.h>

struct ElfSection {
    std::string name;
    u32 addr;
    u32 offset;
    u32 size;
    u32 type;
    u32 flags;
    std::vector<u8> data;
};

struct ElfSymbol {
    std::string name;
    u32 value;
    u32 size;
    u8  info;
    u8  other;
    u16 shndx;
};

class ElfLoader {
public:
    ElfLoader() = default;
    ~ElfLoader() = default;

    bool load(const std::string& filename);
    void dump() const;

    const std::vector<ElfSection>& sections() const { return sections_; }
    const std::vector<ElfSymbol>& symbols() const { return symbols_; }
    u32 entry_point() const { return entry_; }
    u32 get_symbol_addr(const std::string& name) const;

private:
    std::vector<ElfSection> sections_;
    std::vector<ElfSymbol> symbols_;
    u32 entry_ = 0;
};
