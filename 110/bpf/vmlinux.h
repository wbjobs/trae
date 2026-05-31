#ifndef __VMLINUX_H__
#define __VMLINUX_H__

#include <linux/types.h>
#include <linux/bpf.h>

#define ETH_P_IP 0x0800
#define IPPROTO_TCP 6

struct ethhdr {
    unsigned char h_dest[6];
    unsigned char h_source[6];
    __be16 h_proto;
} __attribute__((packed));

struct iphdr {
    __u8 ihl:4;
    __u8 version:4;
    __u8 tos;
    __be16 tot_len;
    __be16 id;
    __be16 frag_off;
    __u8 ttl;
    __u8 protocol;
    __sum16 check;
    __be32 saddr;
    __be32 daddr;
} __attribute__((packed));

struct tcphdr {
    __be16 source;
    __be16 dest;
    __u32 seq;
    __u32 ack_seq;
    __u16 res1:4;
    __u16 doff:4;
    __u16 fin:1;
    __u16 syn:1;
    __u16 rst:1;
    __u16 psh:1;
    __u16 ack:1;
    __u16 urg:1;
    __u16 ece:1;
    __u16 cwr:1;
    __u16 window;
    __sum16 check;
    __u16 urg_ptr;
} __attribute__((packed));

#endif
