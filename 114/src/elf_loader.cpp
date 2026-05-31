#include "elf_loader.h"

bool ElfLoader::load(const std::string& filename) {
    if (elf_version(EV_CURRENT) == EV_NONE) {
        std::cerr << "libelf initialization failed" << std::endl;
        return false;
    }

    int fd = open(filename.c_str(), O_RDONLY);
    if (fd < 0) {
        std::cerr << "Failed to open ELF file: " << filename << std::endl;
        return false;
    }

    Elf* elf = elf_begin(fd, ELF_C_READ, nullptr);
    if (!elf) {
        std::cerr << "elf_begin failed: " << elf_errmsg(-1) << std::endl;
        close(fd);
        return false;
    }

    if (elf_kind(elf) != ELF_K_ELF) {
        std::cerr << "Not an ELF file" << std::endl;
        elf_end(elf);
        close(fd);
        return false;
    }

    GElf_Ehdr ehdr;
    if (!gelf_getehdr(elf, &ehdr)) {
        std::cerr << "gelf_getehdr failed" << std::endl;
        elf_end(elf);
        close(fd);
        return false;
    }

    entry_ = static_cast<u32>(ehdr.e_entry);

    Elf_Scn* scn = nullptr;
    while ((scn = elf_nextscn(elf, scn)) != nullptr) {
        GElf_Shdr shdr;
        if (!gelf_getshdr(scn, &shdr))
            continue;

        ElfSection section;
        const char* name = elf_strptr(elf, ehdr.e_shstrndx, shdr.sh_name);
        section.name   = name ? name : "";
        section.addr   = static_cast<u32>(shdr.sh_addr);
        section.offset = static_cast<u32>(shdr.sh_offset);
        section.size   = static_cast<u32>(shdr.sh_size);
        section.type   = static_cast<u32>(shdr.sh_type);
        section.flags  = static_cast<u32>(shdr.sh_flags);

        if (shdr.sh_type == SHT_PROGBITS && shdr.sh_size > 0) {
            Elf_Data* data = elf_getdata(scn, nullptr);
            if (data) {
                section.data.assign(
                    static_cast<u8*>(data->d_buf),
                    static_cast<u8*>(data->d_buf) + data->d_size
                );
            }
        }

        sections_.push_back(std::move(section));
    }

    Elf_Scn* symtab_scn = nullptr;
    while ((symtab_scn = elf_nextscn(elf, symtab_scn)) != nullptr) {
        GElf_Shdr shdr;
        if (!gelf_getshdr(symtab_scn, &shdr))
            continue;

        if (shdr.sh_type != SHT_SYMTAB)
            continue;

        Elf_Data* data = elf_getdata(symtab_scn, nullptr);
        if (!data)
            continue;

        size_t sym_count = shdr.sh_size / shdr.sh_entsize;
        for (size_t i = 0; i < sym_count; ++i) {
            GElf_Sym sym;
            if (!gelf_getsym(data, static_cast<GElf_Off>(i), &sym))
                continue;

            ElfSymbol esym;
            esym.name  = elf_strptr(elf, shdr.sh_link, sym.st_name) ?: "";
            esym.value = static_cast<u32>(sym.st_value);
            esym.size  = static_cast<u32>(sym.st_size);
            esym.info  = sym.st_info;
            esym.other = sym.st_other;
            esym.shndx = sym.st_shndx;
            symbols_.push_back(std::move(esym));
        }
    }

    elf_end(elf);
    close(fd);
    return true;
}

void ElfLoader::dump() const {
    std::cout << "=== ELF Sections ===" << std::endl;
    for (const auto& s : sections_) {
        std::cout << "  " << std::left << std::setw(20) << s.name
                  << " addr=0x" << std::hex << std::setw(8) << std::setfill('0') << s.addr
                  << " offset=0x" << std::setw(8) << s.offset
                  << " size=0x" << std::setw(8) << s.size
                  << " type=0x" << std::setw(2) << s.type
                  << " flags=0x" << std::setw(8) << s.flags
                  << std::dec << std::setfill(' ') << std::endl;
    }

    std::cout << "\n=== ELF Symbols ===" << std::endl;
    for (const auto& s : symbols_) {
        if (s.name.empty()) continue;
        std::cout << "  " << std::left << std::setw(30) << s.name
                  << " value=0x" << std::hex << std::setw(8) << std::setfill('0') << s.value
                  << " size=0x" << std::setw(8) << s.size
                  << std::dec << std::setfill(' ') << std::endl;
    }

    std::cout << "\nEntry point: 0x" << std::hex << entry_ << std::dec << std::endl;
}

u32 ElfLoader::get_symbol_addr(const std::string& name) const {
    for (const auto& s : symbols_) {
        if (s.name == name)
            return s.value;
    }
    return 0;
}
