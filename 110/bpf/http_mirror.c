//go:build ignore

#include "vmlinux.h"
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>
#include <bpf/bpf_tracing.h>

#define MAX_PAYLOAD_SIZE 1500
#define TARGET_PORT1 80
#define TARGET_PORT2 8080

struct {
    __uint(type, BPF_MAP_TYPE_PERF_EVENT_ARRAY);
    __uint(key_size, sizeof(u32));
    __uint(value_size, sizeof(u32));
} events SEC(".maps");

struct event_t {
    u32 src_ip;
    u32 dst_ip;
    u16 src_port;
    u16 dst_port;
    u16 payload_len;
    u8 payload[MAX_PAYLOAD_SIZE];
};

SEC("classifier/egress")
int mirror_http(struct __sk_buff *skb) {
    void *data = (void *)(long)skb->data;
    void *data_end = (void *)(long)skb->data_end;

    struct ethhdr *eth = data;
    if ((void *)(eth + 1) > data_end)
        return BPF_OK;

    if (eth->h_proto != __bpf_htons(ETH_P_IP))
        return BPF_OK;

    struct iphdr *ip = (struct iphdr *)(eth + 1);
    if ((void *)(ip + 1) > data_end)
        return BPF_OK;

    if (ip->protocol != IPPROTO_TCP)
        return BPF_OK;

    struct tcphdr *tcp = (struct tcphdr *)((void *)ip + (ip->ihl * 4));
    if ((void *)(tcp + 1) > data_end)
        return BPF_OK;

    u16 dst_port = __bpf_ntohs(tcp->dest);
    u16 src_port = __bpf_ntohs(tcp->source);

    if (dst_port != TARGET_PORT1 && dst_port != TARGET_PORT2 &&
        src_port != TARGET_PORT1 && src_port != TARGET_PORT2)
        return BPF_OK;

    u32 tcp_hdr_len = tcp->doff * 4;
    void *payload = (void *)tcp + tcp_hdr_len;

    if (payload >= data_end)
        return BPF_OK;

    u32 payload_len = data_end - payload;
    if (payload_len == 0 || payload_len > MAX_PAYLOAD_SIZE)
        return BPF_OK;

    if (payload_len < 4)
        return BPF_OK;

    u8 *p = payload;
    if (!(p[0] == 'G' && p[1] == 'E' && p[2] == 'T') &&
        !(p[0] == 'P' && p[1] == 'O' && p[2] == 'S' && p[3] == 'T') &&
        !(p[0] == 'P' && p[1] == 'U' && p[2] == 'T') &&
        !(p[0] == 'D' && p[1] == 'E' && p[2] == 'L' && p[3] == 'E') &&
        !(p[0] == 'H' && p[1] == 'E' && p[2] == 'A' && p[3] == 'D') &&
        !(p[0] == 'O' && p[1] == 'P' && p[2] == 'T' && p[3] == 'I') &&
        !(p[0] == 'P' && p[1] == 'A' && p[2] == 'T' && p[3] == 'C') &&
        !(p[0] == 'C' && p[1] == 'O' && p[2] == 'N' && p[3] == 'N'))
        return BPF_OK;

    struct event_t event = {};
    event.src_ip = ip->saddr;
    event.dst_ip = ip->daddr;
    event.src_port = src_port;
    event.dst_port = dst_port;
    event.payload_len = payload_len > MAX_PAYLOAD_SIZE ? MAX_PAYLOAD_SIZE : payload_len;

    __builtin_memcpy(event.payload, payload, event.payload_len);

    bpf_perf_event_output(skb, &events, BPF_F_CURRENT_CPU, &event, sizeof(event));

    return BPF_OK;
}

char _license[] SEC("license") = "GPL";
