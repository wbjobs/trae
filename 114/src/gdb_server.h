#pragma once

#include "types.h"
#include "cpu_state.h"
#include <string>
#include <vector>
#include <map>
#include <functional>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib, "ws2_32.lib")
using SocketType = SOCKET;
constexpr SocketType INVALID_SOCK = INVALID_SOCKET;
#else
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
using SocketType = int;
constexpr SocketType INVALID_SOCK = -1;
#endif

class GdbServer {
public:
    GdbServer(CpuState& cpu, int port = 1234);
    ~GdbServer();

    bool start();
    void stop();
    void process();
    bool is_connected() const { return client_connected_; }

    bool should_halt() const { return halt_requested_; }
    bool should_step() const { return step_requested_; }

    void on_halt();

private:
    CpuState& cpu_;
    int port_;
    SocketType server_fd_;
    SocketType client_fd_;
    bool client_connected_;
    bool halt_requested_;
    bool step_requested_;
    bool no_ack_mode_;

    std::string recv_packet();
    void send_packet(const std::string& data);
    void send_ack();
    void send_nack();

    void handle_query(const std::string& data);
    void handle_register_read();
    void handle_register_write(const std::string& data);
    void handle_memory_read(const std::string& data);
    void handle_memory_write(const std::string& data);
    void handle_continue();
    void handle_step();
    void handle_halt_reason();
    void handle_detach();

    static std::string to_hex(u32 val, int bytes = 4);
    static u32 from_hex(const std::string& s);
    static std::string mem_to_hex(const u8* data, u32 len);
    static std::vector<u8> hex_to_mem(const std::string& s);
    static u8 checksum(const std::string& data);
};
