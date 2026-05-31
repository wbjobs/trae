#include "gdb_server.h"
#include <iostream>
#include <cstring>
#include <sstream>
#include <iomanip>
#include <cstdio>

GdbServer::GdbServer(CpuState& cpu, int port)
    : cpu_(cpu)
    , port_(port)
    , server_fd_(INVALID_SOCK)
    , client_fd_(INVALID_SOCK)
    , client_connected_(false)
    , halt_requested_(false)
    , step_requested_(false)
    , no_ack_mode_(false)
{
#ifdef _WIN32
    WSADATA wsa;
    WSAStartup(MAKEWORD(2, 2), &wsa);
#endif
}

GdbServer::~GdbServer() {
    stop();
#ifdef _WIN32
    WSACleanup();
#endif
}

bool GdbServer::start() {
    server_fd_ = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd_ == INVALID_SOCK) {
        std::cerr << "GDB: socket() failed" << std::endl;
        return false;
    }

    int opt = 1;
#ifdef _WIN32
    setsockopt(server_fd_, SOL_SOCKET, SO_REUSEADDR,
               reinterpret_cast<const char*>(&opt), sizeof(opt));
#else
    setsockopt(server_fd_, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
#endif

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(port_);

    if (bind(server_fd_, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) < 0) {
        std::cerr << "GDB: bind() failed" << std::endl;
        stop();
        return false;
    }

    if (listen(server_fd_, 1) < 0) {
        std::cerr << "GDB: listen() failed" << std::endl;
        stop();
        return false;
    }

    std::cout << "GDB: listening on port " << port_ << "..." << std::endl;
    return true;
}

void GdbServer::stop() {
    if (client_fd_ != INVALID_SOCK) {
#ifdef _WIN32
        closesocket(client_fd_);
#else
        close(client_fd_);
#endif
        client_fd_ = INVALID_SOCK;
    }
    if (server_fd_ != INVALID_SOCK) {
#ifdef _WIN32
        closesocket(server_fd_);
#else
        close(server_fd_);
#endif
        server_fd_ = INVALID_SOCK;
    }
    client_connected_ = false;
}

void GdbServer::process() {
    if (!client_connected_) {
        client_fd_ = accept(server_fd_, nullptr, nullptr);
        if (client_fd_ == INVALID_SOCK) return;
        client_connected_ = true;
        no_ack_mode_ = false;
        std::cout << "GDB: client connected" << std::endl;
    }

    std::string packet = recv_packet();
    if (packet.empty()) return;

    if (packet[0] == '+') return;
    if (packet[0] == '-') return;

    if (packet[0] == '$') {
        std::string payload = packet.substr(1);
        size_t hash_pos = payload.find('#');
        if (hash_pos == std::string::npos) return;

        std::string data = payload.substr(0, hash_pos);

        if (!no_ack_mode_)
            send_ack();

        if (data.empty()) return;

        char cmd = data[0];
        std::string args = data.substr(1);

        switch (cmd) {
            case 'q': handle_query(args); break;
            case 'g': handle_register_read(); break;
            case 'G': handle_register_write(args); break;
            case 'm': handle_memory_read(args); break;
            case 'M': handle_memory_write(args); break;
            case 'c': handle_continue(); break;
            case 's': handle_step(); break;
            case '?': handle_halt_reason(); break;
            case 'D': handle_detach(); return;
            case 'k':
                std::cout << "GDB: kill requested" << std::endl;
                stop();
                return;
            case 'Z': case 'z':
                send_packet("");
                break;
            case 'v':
                if (args.substr(0, 8) == "Cont?") {
                    send_packet("vCont;c;C;s;S");
                } else if (args.substr(0, 6) == "Cont;c") {
                    handle_continue();
                } else if (args.substr(0, 6) == "Cont;s") {
                    handle_step();
                } else {
                    send_packet("");
                }
                break;
            default:
                send_packet("");
                break;
        }
    }
}

std::string GdbServer::recv_packet() {
    std::string buf;
    char c;
    int ret;

#ifdef _WIN32
    u_long mode = 1;
    ioctlsocket(client_fd_, FIONBIO, &mode);
#endif

    while (true) {
#ifdef _WIN32
        ret = recv(client_fd_, &c, 1, 0);
        if (ret == SOCKET_ERROR) {
            int err = WSAGetLastError();
            if (err == WSAEWOULDBLOCK) {
                if (buf.empty()) { mode = 0; ioctlsocket(client_fd_, FIONBIO, &mode); return ""; }
                continue;
            }
            break;
        }
#else
        ret = static_cast<int>(recv(client_fd_, &c, 1, MSG_DONTWAIT));
        if (ret <= 0) {
            if (buf.empty()) return "";
            break;
        }
#endif
        buf += c;
        if (c == '#') {
            char csum[2];
            int total = 0;
            while (total < 2) {
#ifdef _WIN32
                ret = recv(client_fd_, csum + total, 2 - total, 0);
#else
                ret = static_cast<int>(recv(client_fd_, csum + total, 2 - total, 0));
#endif
                if (ret <= 0) break;
                total += ret;
            }
            if (total == 2) {
                buf += csum[0];
                buf += csum[1];
            }
            break;
        }
        if (c == '+' || c == '-') {
            break;
        }
    }

#ifdef _WIN32
    u_long mode0 = 0;
    ioctlsocket(client_fd_, FIONBIO, &mode0);
#endif
    return buf;
}

void GdbServer::send_packet(const std::string& data) {
    std::string packet = "$" + data + "#";
    char csum_buf[8];
    std::snprintf(csum_buf, sizeof(csum_buf), "%02x", checksum(data));
    packet += csum_buf;

#ifdef _WIN32
    send(client_fd_, packet.c_str(), static_cast<int>(packet.size()), 0);
#else
    send(client_fd_, packet.c_str(), packet.size(), 0);
#endif
}

void GdbServer::send_ack() {
    char c = '+';
#ifdef _WIN32
    send(client_fd_, &c, 1, 0);
#else
    send(client_fd_, &c, 1, 0);
#endif
}

void GdbServer::send_nack() {
    char c = '-';
#ifdef _WIN32
    send(client_fd_, &c, 1, 0);
#else
    send(client_fd_, &c, 1, 0);
#endif
}

void GdbServer::handle_query(const std::string& data) {
    if (data == "Supported") {
        send_packet("PacketSize=1000;qXfer:features:read+");
    } else if (data.substr(0, 7) == "Xfer:features:read:target.xml:") {
        std::string xml = R"(<?xml version="1.0"?>
<!DOCTYPE target SYSTEM "gdb-target.dtd">
<target version="1.0">
  <architecture>riscv:rv32</architecture>
  <feature name="org.gnu.gdb.riscv.cpu">
    <reg name="zero" bitsize="32" regnum="0"/>
    <reg name="ra"   bitsize="32" regnum="1"/>
    <reg name="sp"   bitsize="32" regnum="2"/>
    <reg name="gp"   bitsize="32" regnum="3"/>
    <reg name="tp"   bitsize="32" regnum="4"/>
    <reg name="t0"   bitsize="32" regnum="5"/>
    <reg name="t1"   bitsize="32" regnum="6"/>
    <reg name="t2"   bitsize="32" regnum="7"/>
    <reg name="s0"   bitsize="32" regnum="8"/>
    <reg name="s1"   bitsize="32" regnum="9"/>
    <reg name="a0"   bitsize="32" regnum="10"/>
    <reg name="a1"   bitsize="32" regnum="11"/>
    <reg name="a2"   bitsize="32" regnum="12"/>
    <reg name="a3"   bitsize="32" regnum="13"/>
    <reg name="a4"   bitsize="32" regnum="14"/>
    <reg name="a5"   bitsize="32" regnum="15"/>
    <reg name="a6"   bitsize="32" regnum="16"/>
    <reg name="a7"   bitsize="32" regnum="17"/>
    <reg name="s2"   bitsize="32" regnum="18"/>
    <reg name="s3"   bitsize="32" regnum="19"/>
    <reg name="s4"   bitsize="32" regnum="20"/>
    <reg name="s5"   bitsize="32" regnum="21"/>
    <reg name="s6"   bitsize="32" regnum="22"/>
    <reg name="s7"   bitsize="32" regnum="23"/>
    <reg name="s8"   bitsize="32" regnum="24"/>
    <reg name="s9"   bitsize="32" regnum="25"/>
    <reg name="s10"  bitsize="32" regnum="26"/>
    <reg name="s11"  bitsize="32" regnum="27"/>
    <reg name="t3"   bitsize="32" regnum="28"/>
    <reg name="t4"   bitsize="32" regnum="29"/>
    <reg name="t5"   bitsize="32" regnum="30"/>
    <reg name="t6"   bitsize="32" regnum="31"/>
    <reg name="pc"   bitsize="32" regnum="32"/>
  </feature>
</target>)";
        send_packet("l" + xml);
    } else if (data == "Attached") {
        send_packet("");
    } else if (data.substr(0, 4) == "Crc:") {
        send_packet("");
    } else if (data == "TStatus") {
        send_packet("");
    } else if (data.substr(0, 6) == "Symbol") {
        send_packet("OK");
    } else if (data.substr(0, 9) == "Rcmd,7468") {
        send_packet("OK");
    } else if (data.substr(0, 9) == "fThreadInfo") {
        send_packet("m01");
    } else if (data.substr(0, 9) == "sThreadInfo") {
        send_packet("l");
    } else if (data.substr(0, 8) == "ThreadExtraInfo") {
        send_packet("");
    } else if (data == "P") {
        send_packet("");
    } else if (data.substr(0, 5) == "StartNoAckMode") {
        no_ack_mode_ = true;
        send_packet("OK");
    } else {
        send_packet("");
    }
}

void GdbServer::handle_register_read() {
    std::string data;
    for (u32 i = 0; i < NUM_REGS; ++i) {
        data += to_hex(cpu_.reg(i), 4);
    }
    data += to_hex(cpu_.pc(), 4);
    send_packet(data);
}

void GdbServer::handle_register_write(const std::string& data) {
    if (data.size() < NUM_REGS * 8) return;
    for (u32 i = 0; i < NUM_REGS; ++i) {
        std::string hex = data.substr(i * 8, 8);
        cpu_.set_reg(i, from_hex(hex));
    }
    if (data.size() >= (NUM_REGS + 1) * 8) {
        std::string hex = data.substr(NUM_REGS * 8, 8);
        cpu_.set_pc(from_hex(hex));
    }
    send_packet("OK");
}

void GdbServer::handle_memory_read(const std::string& data) {
    size_t comma = data.find(',');
    if (comma == std::string::npos) return;

    u32 addr = from_hex(data.substr(0, comma));
    u32 len = from_hex(data.substr(comma + 1));

    std::string result;
    for (u32 i = 0; i < len; ++i) {
        u8 byte = cpu_.read_mem_u8(addr + i);
        char buf[4];
        std::snprintf(buf, sizeof(buf), "%02x", byte);
        result += buf;
    }
    send_packet(result);
}

void GdbServer::handle_memory_write(const std::string& data) {
    size_t comma1 = data.find(',');
    size_t colon = data.find(':');
    if (comma1 == std::string::npos || colon == std::string::npos) return;

    u32 addr = from_hex(data.substr(0, comma1));
    u32 len = from_hex(data.substr(comma1 + 1, colon - comma1 - 1));
    std::string mem_data = data.substr(colon + 1);

    auto bytes = hex_to_mem(mem_data);
    for (u32 i = 0; i < len && i < bytes.size(); ++i) {
        cpu_.write_mem_u8(addr + i, bytes[i]);
    }
    send_packet("OK");
}

void GdbServer::handle_continue() {
    halt_requested_ = false;
    step_requested_ = false;
}

void GdbServer::handle_step() {
    step_requested_ = true;
    halt_requested_ = false;
}

void GdbServer::handle_halt_reason() {
    send_packet("S05");
}

void GdbServer::handle_detach() {
    std::cout << "GDB: client detached" << std::endl;
    send_packet("OK");
#ifdef _WIN32
    closesocket(client_fd_);
#else
    close(client_fd_);
#endif
    client_fd_ = INVALID_SOCK;
    client_connected_ = false;
}

void GdbServer::on_halt() {
    if (client_connected_)
        send_packet("S05");
    halt_requested_ = true;
}

std::string GdbServer::to_hex(u32 val, int bytes) {
    std::ostringstream oss;
    oss << std::hex << std::setfill('0');
    for (int b = 0; b < bytes; ++b) {
        oss << std::setw(2) << (val & 0xFF);
        val >>= 8;
    }
    return oss.str();
}

u32 GdbServer::from_hex(const std::string& s) {
    u32 val = 0;
    for (size_t i = 0; i < s.size(); i += 2) {
        u32 byte = 0;
        char c1 = s[i];
        char c2 = (i + 1 < s.size()) ? s[i + 1] : '0';

        if (c1 >= '0' && c1 <= '9') byte |= (c1 - '0') << 4;
        else if (c1 >= 'a' && c1 <= 'f') byte |= (c1 - 'a' + 10) << 4;
        else if (c1 >= 'A' && c1 <= 'F') byte |= (c1 - 'A' + 10) << 4;

        if (c2 >= '0' && c2 <= '9') byte |= (c2 - '0');
        else if (c2 >= 'a' && c2 <= 'f') byte |= (c2 - 'a' + 10);
        else if (c2 >= 'A' && c2 <= 'F') byte |= (c2 - 'A' + 10);

        val |= byte << (i / 2 * 8);
    }
    return val;
}

std::string GdbServer::mem_to_hex(const u8* data, u32 len) {
    std::string result;
    for (u32 i = 0; i < len; ++i) {
        char buf[4];
        std::snprintf(buf, sizeof(buf), "%02x", data[i]);
        result += buf;
    }
    return result;
}

std::vector<u8> GdbServer::hex_to_mem(const std::string& s) {
    std::vector<u8> result;
    for (size_t i = 0; i + 1 < s.size(); i += 2) {
        u8 byte = 0;
        char c1 = s[i];
        char c2 = s[i + 1];

        if (c1 >= '0' && c1 <= '9') byte |= (c1 - '0') << 4;
        else if (c1 >= 'a' && c1 <= 'f') byte |= (c1 - 'a' + 10) << 4;
        else if (c1 >= 'A' && c1 <= 'F') byte |= (c1 - 'A' + 10) << 4;

        if (c2 >= '0' && c2 <= '9') byte |= (c2 - '0');
        else if (c2 >= 'a' && c2 <= 'f') byte |= (c2 - 'a' + 10);
        else if (c2 >= 'A' && c2 <= 'F') byte |= (c2 - 'A' + 10);

        result.push_back(byte);
    }
    return result;
}

u8 GdbServer::checksum(const std::string& data) {
    u8 sum = 0;
    for (char c : data) sum += static_cast<u8>(c);
    return sum;
}
