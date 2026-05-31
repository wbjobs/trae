#include "types.h"
#include "elf_loader.h"
#include "cpu_state.h"
#include "decoder.h"
#include "executor.h"
#include "stats.h"
#include "flame_graph.h"
#include "gdb_server.h"
#include "loop_detector.h"
#include "superscalar.h"

#include <iostream>
#include <string>
#include <chrono>
#include <cstring>
#include <cstdio>

static void print_usage(const char* prog) {
    std::cout << "RV32IM Instruction Set Simulator\n"
              << "Usage: " << prog << " [options] <elf_file>\n\n"
              << "Options:\n"
              << "  --help                   Show this help message\n"
              << "  --max-instr N            Stop after N instructions (default: unlimited)\n"
              << "  --gdb-port PORT          Enable GDB remote debugging on PORT (default: 1234)\n"
              << "  --gdb                    Wait for GDB connection before starting\n"
              << "  --no-stats               Disable instruction statistics\n"
              << "  --flame FILE             Generate SVG flame graph to FILE\n"
              << "  --dump-elf               Dump ELF sections and symbols\n"
              << "  --trace                  Enable instruction trace output\n"
              << "  --dump-regs              Dump registers on halt\n"
              << "  --loop-window N          PC history window for loop detection (default: 2000)\n"
              << "  --loop-repeat N          PC repeat threshold for loop detection (default: window/3)\n"
              << "  --no-side-effect-limit N Max instructions without side effects (default: 5000000)\n"
              << "  --no-loop-detect         Disable infinite loop detection\n"
              << "  --superscalar            Enable dual-issue superscalar simulation\n"
              << "  --issue-width N          Superscalar issue width (default: 2)\n"
              << "  --scalar-compare         Show scalar vs superscalar comparison\n";
}

struct Options {
    std::string elf_file;
    u64 max_instr = 0;
    int gdb_port = 1234;
    bool gdb_wait = false;
    bool no_stats = false;
    std::string flame_file;
    bool dump_elf = false;
    bool trace = false;
    bool dump_regs = false;
    size_t loop_window = 2000;
    size_t loop_repeat = 0;
    u64 no_side_effect_limit = 5000000;
    bool no_loop_detect = false;
    bool superscalar = false;
    u32 issue_width = 2;
    bool scalar_compare = false;
};

static Options parse_args(int argc, char* argv[]) {
    Options opts;
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--help") {
            print_usage(argv[0]);
            std::exit(0);
        } else if (arg == "--max-instr" && i + 1 < argc) {
            opts.max_instr = std::stoull(argv[++i]);
        } else if (arg == "--gdb-port" && i + 1 < argc) {
            opts.gdb_port = std::atoi(argv[++i]);
        } else if (arg == "--gdb") {
            opts.gdb_wait = true;
        } else if (arg == "--no-stats") {
            opts.no_stats = true;
        } else if (arg == "--flame" && i + 1 < argc) {
            opts.flame_file = argv[++i];
        } else if (arg == "--dump-elf") {
            opts.dump_elf = true;
        } else if (arg == "--trace") {
            opts.trace = true;
        } else if (arg == "--dump-regs") {
            opts.dump_regs = true;
        } else if (arg == "--loop-window" && i + 1 < argc) {
            opts.loop_window = std::stoull(argv[++i]);
        } else if (arg == "--loop-repeat" && i + 1 < argc) {
            opts.loop_repeat = std::stoull(argv[++i]);
        } else if (arg == "--no-side-effect-limit" && i + 1 < argc) {
            opts.no_side_effect_limit = std::stoull(argv[++i]);
        } else if (arg == "--no-loop-detect") {
            opts.no_loop_detect = true;
        } else if (arg == "--superscalar") {
            opts.superscalar = true;
        } else if (arg == "--issue-width" && i + 1 < argc) {
            opts.issue_width = static_cast<u32>(std::stoul(argv[++i]));
        } else if (arg == "--scalar-compare") {
            opts.scalar_compare = true;
        } else if (arg[0] != '-') {
            opts.elf_file = arg;
        } else {
            std::cerr << "Unknown option: " << arg << std::endl;
            print_usage(argv[0]);
            std::exit(1);
        }
    }
    return opts;
}

int main(int argc, char* argv[]) {
    Options opts = parse_args(argc, argv);

    if (opts.elf_file.empty()) {
        std::cerr << "Error: no ELF file specified" << std::endl;
        print_usage(argv[0]);
        return 1;
    }

    ElfLoader elf;
    if (!elf.load(opts.elf_file)) {
        std::cerr << "Failed to load ELF file: " << opts.elf_file << std::endl;
        return 1;
    }

    if (opts.dump_elf) {
        elf.dump();
    }

    CpuState cpu;
    cpu.reset(elf.entry_point());

    for (const auto& sec : elf.sections()) {
        if (sec.type == 1 && sec.size > 0 && !sec.data.empty()) {
            cpu.load_section(sec.addr, sec.data.data(), sec.size());
        }
    }

    Executor executor(cpu);
    Stats stats;
    LoopDetector loop_detector(opts.loop_window, opts.loop_repeat,
                               opts.no_side_effect_limit);
    Superscalar superscalar(opts.issue_width);

    std::map<u32, std::string> addr_labels;
    for (const auto& sym : elf.symbols()) {
        if (!sym.name.empty() && sym.value != 0) {
            addr_labels[sym.value] = sym.name;
        }
    }

    GdbServer gdb(cpu, opts.gdb_port);
    bool gdb_enabled = opts.gdb_wait;

    if (gdb_enabled) {
        if (!gdb.start()) {
            std::cerr << "Failed to start GDB server" << std::endl;
            return 1;
        }
        std::cout << "Waiting for GDB connection..." << std::endl;
        while (!gdb.is_connected()) {
            gdb.process();
        }
    }

    std::cout << "Starting simulation from entry point: 0x"
              << std::hex << elf.entry_point() << std::dec << std::endl;

    auto t_start = std::chrono::high_resolution_clock::now();
    u64 instr_count = 0;

    while (!cpu.is_halted()) {
        if (gdb_enabled && gdb.is_connected()) {
            gdb.process();
            if (gdb.should_halt() && !gdb.should_step()) {
                continue;
            }
        }

        u32 pc = cpu.pc();
        u32 raw1 = cpu.read_instr(pc);
        Instruction instr1 = Decoder::decode(raw1);

        Instruction instr2;
        u32 pc2 = pc + 4;
        bool dual_issued = false;

        if (opts.superscalar && !cpu.is_halted() &&
            !(gdb_enabled && gdb.is_connected() && gdb.should_step())) {
            u32 raw2 = cpu.read_instr(pc2);
            if (raw2 != 0) {
                instr2 = Decoder::decode(raw2);
                if (superscalar.can_pair(instr1, instr2)) {
                    dual_issued = true;
                }
            }
        }

        if (opts.trace) {
            auto fmt_label = [&](u32 addr) -> std::string {
                auto it = addr_labels.find(addr);
                return (it != addr_labels.end()) ? (" <" + it->second + ">") : "";
            };

            if (dual_issued) {
                std::cout << "  [DUAL] ";
            }
            std::cout << "0x" << std::hex << std::setw(8) << std::setfill('0') << pc
                      << std::dec << std::setfill(' ')
                      << ": " << std::left << std::setw(10) << instr1.mnemonic
                      << fmt_label(pc) << std::endl;

            if (dual_issued) {
                std::cout << "         0x" << std::hex << std::setw(8) << std::setfill('0') << pc2
                          << std::dec << std::setfill(' ')
                          << ": " << std::left << std::setw(10) << instr2.mnemonic
                          << fmt_label(pc2) << std::endl;
            }
        }

        executor.execute(instr1);
        bool cycle_side_effect = executor.had_side_effect();
        u32 issued = 1;

        if (dual_issued && !cpu.is_halted()) {
            executor.clear_side_effect();
            executor.execute(instr2);
            cycle_side_effect = cycle_side_effect || executor.had_side_effect();
            issued = 2;
        }

        superscalar.record_cycle(issued);

        if (!opts.no_stats) {
            stats.record(instr1);
            stats.record_by_addr(pc, instr1.mnemonic);
            if (dual_issued) {
                stats.record(instr2);
                stats.record_by_addr(pc2, instr2.mnemonic);
            }
        }

        instr_count += issued;

        if (!opts.no_loop_detect) {
            if (loop_detector.feed(pc, cycle_side_effect && issued == 1)) {
                cpu.set_halt(HaltReason::INFINITE_LOOP);
                break;
            }
            if (dual_issued) {
                if (loop_detector.feed(pc2, cycle_side_effect)) {
                    cpu.set_halt(HaltReason::INFINITE_LOOP);
                    break;
                }
            }
        }
        executor.clear_side_effect();

        if (gdb_enabled && gdb.is_connected() && gdb.should_step()) {
            gdb.on_halt();
        }

        if (opts.max_instr > 0 && instr_count >= opts.max_instr) {
            std::cout << "\nReached maximum instruction count: " << instr_count << std::endl;
            break;
        }
    }

    auto t_end = std::chrono::high_resolution_clock::now();
    auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(t_end - t_start);

    std::cout << "\n=== Simulation Complete ===" << std::endl;
    std::cout << "Halt reason: ";
    switch (cpu.halt_reason()) {
        case HaltReason::ECALL:               std::cout << "ECALL"; break;
        case HaltReason::EBREAK:              std::cout << "EBREAK"; break;
        case HaltReason::MEMORY_ERROR:        std::cout << "MEMORY_ERROR"; break;
        case HaltReason::INVALID_INSTRUCTION: std::cout << "INVALID_INSTRUCTION"; break;
        case HaltReason::INFINITE_LOOP:       std::cout << "INFINITE_LOOP"; break;
        default:                               std::cout << "OTHER"; break;
    }
    std::cout << std::endl;

    if (cpu.halt_reason() == HaltReason::INFINITE_LOOP) {
        std::cout << "Infinite loop detected!" << std::endl;
        std::cout << "  Repeated PC: 0x" << std::hex
                  << std::setw(8) << std::setfill('0')
                  << loop_detector.repeated_pc() << std::dec
                  << std::setfill(' ') << std::endl;
        std::cout << "  Repeat count in window: "
                  << loop_detector.repeated_count() << std::endl;
        std::cout << "  Consecutive instructions without side effects: "
                  << loop_detector.no_side_effect_streak() << std::endl;

        std::string label;
        auto it = addr_labels.find(loop_detector.repeated_pc());
        if (it != addr_labels.end()) {
            label = it->second;
        } else {
            char buf[16];
            std::snprintf(buf, sizeof(buf), "0x%08x", loop_detector.repeated_pc());
            label = buf;
        }
        std::cout << "  At: " << label << std::endl;
        std::cout << "  (use --no-loop-detect to disable, or --no-side-effect-limit N to adjust threshold)"
                  << std::endl;
    }
    std::cout << "Instructions executed: " << instr_count << std::endl;
    std::cout << "Time elapsed: " << elapsed.count() << " ms" << std::endl;
    if (elapsed.count() > 0) {
        std::cout << "Performance: " << (instr_count * 1000 / elapsed.count())
                  << " instr/s" << std::endl;
    }

    if (opts.superscalar) {
        superscalar.print_stats(std::cout, instr_count);
    } else if (opts.scalar_compare) {
        std::cout << "\n=== Scalar Simulation (baseline) ===" << std::endl;
        std::cout << "  Cycles (1 IPC): " << instr_count << std::endl;
        std::cout << "  IPC:             1.0000" << std::endl;
    }

    if (opts.dump_regs) {
        cpu.dump_registers();
    }

    if (!opts.no_stats) {
        stats.print_top(std::cout, 10);
    }

    if (!opts.flame_file.empty()) {
        FlameGraph::generate(stats, opts.flame_file, addr_labels);
    }

    if (gdb_enabled) {
        gdb.stop();
    }

    return 0;
}
