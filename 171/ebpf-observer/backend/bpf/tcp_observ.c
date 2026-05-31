#include <linux/bpf.h>
#include <linux/tcp.h>
#include <linux/ip.h>
#include <linux/types.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>

#define MAX_ENTRIES 4096
#define MAX_SERVICES 256
#define TLS_BUF_SIZE 256
#define SSL_RAND_SIZE 32
#define SSL_MASTER_KEY_SIZE 48
#define SSL_SESSION_ID_SIZE 32

struct sock_key {
	__u32 saddr;
	__u32 daddr;
	__u16 sport;
	__u16 dport;
	__u32 sock_ino;
};

struct tcp_stats {
	__u64 timestamp;
	__u32 retransmits;
	__u32 total_packets;
	__u32 packet_losses;
	__u32 srtt_us;
	__u32 events;
};

struct tcp_event {
	__u64 timestamp;
	__u32 saddr;
	__u32 daddr;
	__u16 sport;
	__u16 dport;
	__u32 sock_ino;
	__u32 retransmits;
	__u32 total_packets;
	__u32 packet_losses;
	__u32 srtt_us;
	char event_type[16];
};

struct tls_event {
	__u64 timestamp;
	__u32 pid;
	__u32 len;
	char direction[8];
	char buf[TLS_BUF_SIZE];
};

struct tls_key_event {
	__u64 timestamp;
	__u32 pid;
	__u8  client_random[SSL_RAND_SIZE];
	__u8  session_id[SSL_SESSION_ID_SIZE];
	__u8  master_key[SSL_MASTER_KEY_SIZE];
	__u32 session_id_len;
	__u32 version;
};

struct ssl_read_args {
	unsigned long long pad;
	void *ssl;
	void *buf;
	int size;
};

struct ssl_ctx_info {
	unsigned long long pad;
	void *ctx;
};

struct {
	__uint(type, BPF_MAP_TYPE_HASH);
	__uint(max_entries, MAX_ENTRIES);
	__type(key, struct sock_key);
	__type(value, struct tcp_stats);
} sock_stats SEC(".maps");

struct {
	__uint(type, BPF_MAP_TYPE_PERF_EVENT_ARRAY);
	__uint(max_entries, 1024);
	__type(key, __u32);
	__type(value, __u32);
} events SEC(".maps");

struct {
	__uint(type, BPF_MAP_TYPE_PERF_EVENT_ARRAY);
	__uint(max_entries, 1024);
	__type(key, __u32);
	__type(value, __u32);
} tls_events SEC(".maps");

struct {
	__uint(type, BPF_MAP_TYPE_PERF_EVENT_ARRAY);
	__uint(max_entries, 1024);
	__type(key, __u32);
	__type(value, __u32);
} tls_key_events SEC(".maps");

struct {
	__uint(type, BPF_MAP_TYPE_HASH);
	__uint(max_entries, 10240);
	__type(key, __u32);
	__type(value, struct ssl_read_args);
} ssl_read_buf SEC(".maps");

struct {
	__uint(type, BPF_MAP_TYPE_HASH);
	__uint(max_entries, 10240);
	__type(key, __u32);
	__type(value, struct ssl_ctx_info);
} ssl_ctx_map SEC(".maps");

static __always_inline void fill_event(struct tcp_event *e, struct sock_key *k,
				       struct tcp_stats *s, const char *type)
{
	e->timestamp = bpf_ktime_get_ns();
	e->saddr = k->saddr;
	e->daddr = k->daddr;
	e->sport = k->sport;
	e->dport = k->dport;
	e->sock_ino = k->sock_ino;
	e->retransmits = s->retransmits;
	e->total_packets = s->total_packets;
	e->packet_losses = s->packet_losses;
	e->srtt_us = s->srtt_us;
	__builtin_memcpy(e->event_type, type, 16);
}

static __always_inline int handle_tcp_retransmit(struct sock_key *k)
{
	struct tcp_stats *s;
	struct tcp_stats new_s = {0};
	struct tcp_event e = {0};

	s = bpf_map_lookup_elem(&sock_stats, k);
	if (!s) {
		new_s.timestamp = bpf_ktime_get_ns();
		new_s.retransmits = 1;
		new_s.total_packets = 1;
		bpf_map_update_elem(&sock_stats, k, &new_s, BPF_ANY);
		fill_event(&e, k, &new_s, "retransmit");
	} else {
		s->retransmits++;
		s->total_packets++;
		s->timestamp = bpf_ktime_get_ns();
		fill_event(&e, k, s, "retransmit");
	}

	bpf_perf_event_output(NULL, &events, BPF_F_CURRENT_CPU, &e, sizeof(e));
	return 0;
}

static __always_inline int handle_tcp_packet_loss(struct sock_key *k)
{
	struct tcp_stats *s;
	struct tcp_stats new_s = {0};
	struct tcp_event e = {0};

	s = bpf_map_lookup_elem(&sock_stats, k);
	if (!s) {
		new_s.timestamp = bpf_ktime_get_ns();
		new_s.packet_losses = 1;
		new_s.total_packets = 1;
		bpf_map_update_elem(&sock_stats, k, &new_s, BPF_ANY);
		fill_event(&e, k, &new_s, "packet_loss");
	} else {
		s->packet_losses++;
		s->total_packets++;
		s->timestamp = bpf_ktime_get_ns();
		fill_event(&e, k, s, "packet_loss");
	}

	bpf_perf_event_output(NULL, &events, BPF_F_CURRENT_CPU, &e, sizeof(e));
	return 0;
}

static __always_inline int handle_tcp_rtt(struct sock_key *k, __u32 srtt_us)
{
	struct tcp_stats *s;
	struct tcp_stats new_s = {0};
	struct tcp_event e = {0};

	s = bpf_map_lookup_elem(&sock_stats, k);
	if (!s) {
		new_s.timestamp = bpf_ktime_get_ns();
		new_s.srtt_us = srtt_us;
		new_s.total_packets = 1;
		bpf_map_update_elem(&sock_stats, k, &new_s, BPF_ANY);
		fill_event(&e, k, &new_s, "rtt_update");
	} else {
		s->srtt_us = srtt_us;
		s->total_packets++;
		s->timestamp = bpf_ktime_get_ns();
		fill_event(&e, k, s, "rtt_update");
	}

	bpf_perf_event_output(NULL, &events, BPF_F_CURRENT_CPU, &e, sizeof(e));
	return 0;
}

SEC("kprobe/tcp_retransmit_skb")
int BPF_KPROBE(tcp_retransmit_skb_entry, struct sock *sk)
{
	struct inet_sock *inet = (struct inet_sock *)sk;
	struct sock_key k = {0};
	__u32 tmp32;
	__u16 tmp16;

	if (bpf_probe_read(&tmp32, sizeof(tmp32), &inet->inet_saddr) == 0)
		k.saddr = tmp32;
	if (bpf_probe_read(&tmp32, sizeof(tmp32), &inet->inet_daddr) == 0)
		k.daddr = tmp32;
	if (bpf_probe_read(&tmp16, sizeof(tmp16), &inet->inet_sport) == 0)
		k.sport = tmp16;
	if (bpf_probe_read(&tmp16, sizeof(tmp16), &inet->inet_dport) == 0)
		k.dport = tmp16;
	k.sock_ino = bpf_get_socket_cookie(sk);

	return handle_tcp_retransmit(&k);
}

SEC("kprobe/tcp_drop")
int BPF_KPROBE(tcp_drop_entry, struct sock *sk, struct sk_buff *skb,
	       __u32 drop_reason)
{
	struct inet_sock *inet = (struct inet_sock *)sk;
	struct sock_key k = {0};
	__u32 tmp32;
	__u16 tmp16;

	if (bpf_probe_read(&tmp32, sizeof(tmp32), &inet->inet_saddr) == 0)
		k.saddr = tmp32;
	if (bpf_probe_read(&tmp32, sizeof(tmp32), &inet->inet_daddr) == 0)
		k.daddr = tmp32;
	if (bpf_probe_read(&tmp16, sizeof(tmp16), &inet->inet_sport) == 0)
		k.sport = tmp16;
	if (bpf_probe_read(&tmp16, sizeof(tmp16), &inet->inet_dport) == 0)
		k.dport = tmp16;
	k.sock_ino = bpf_get_socket_cookie(sk);

	return handle_tcp_packet_loss(&k);
}

SEC("kprobe/tcp_rcv_established")
int BPF_KPROBE(tcp_rcv_established_entry, struct sock *sk, struct sk_buff *skb)
{
	struct inet_sock *inet = (struct inet_sock *)sk;
	struct tcp_sock *tp = (struct tcp_sock *)sk;
	struct sock_key k = {0};
	__u32 tmp32;
	__u16 tmp16;
	__u32 srtt_us = 0;

	if (bpf_probe_read(&tmp32, sizeof(tmp32), &inet->inet_saddr) == 0)
		k.saddr = tmp32;
	if (bpf_probe_read(&tmp32, sizeof(tmp32), &inet->inet_daddr) == 0)
		k.daddr = tmp32;
	if (bpf_probe_read(&tmp16, sizeof(tmp16), &inet->inet_sport) == 0)
		k.sport = tmp16;
	if (bpf_probe_read(&tmp16, sizeof(tmp16), &inet->inet_dport) == 0)
		k.dport = tmp16;
	k.sock_ino = bpf_get_socket_cookie(sk);

	bpf_probe_read(&srtt_us, sizeof(srtt_us), &tp->srtt_us);

	return handle_tcp_rtt(&k, srtt_us >> 3);
}

SEC("uprobe/SSL_write")
int uprobe_ssl_write(struct pt_regs *ctx)
{
	struct ssl_read_args args = {0};
	__u32 pid = bpf_get_current_pid_tgid();

	args.ssl = (void *)PT_REGS_PARM1(ctx);
	args.buf = (void *)PT_REGS_PARM2(ctx);
	args.size = PT_REGS_PARM3(ctx);

	bpf_map_update_elem(&ssl_read_buf, &pid, &args, BPF_ANY);
	return 0;
}

SEC("uretprobe/SSL_write")
int uretprobe_ssl_write(struct pt_regs *ctx)
{
	__u32 pid = bpf_get_current_pid_tgid();
	struct ssl_read_args *args;
	struct tls_event e = {0};
	int ret = PT_REGS_RC(ctx);

	args = bpf_map_lookup_elem(&ssl_read_buf, &pid);
	if (!args)
		return 0;

	bpf_map_delete_elem(&ssl_read_buf, &pid);

	if (ret <= 0)
		return 0;

	e.timestamp = bpf_ktime_get_ns();
	e.pid = pid >> 32;
	e.len = (__u32)(ret > TLS_BUF_SIZE ? TLS_BUF_SIZE : ret);
	__builtin_memcpy(e.direction, "write", 6);

	bpf_probe_read_user_str(&e.buf, TLS_BUF_SIZE, args->buf);

	bpf_perf_event_output(ctx, &tls_events, BPF_F_CURRENT_CPU, &e, sizeof(e));
	return 0;
}

SEC("uprobe/SSL_read")
int uprobe_ssl_read(struct pt_regs *ctx)
{
	struct ssl_read_args args = {0};
	__u32 pid = bpf_get_current_pid_tgid();

	args.ssl = (void *)PT_REGS_PARM1(ctx);
	args.buf = (void *)PT_REGS_PARM2(ctx);
	args.size = PT_REGS_PARM3(ctx);

	bpf_map_update_elem(&ssl_read_buf, &pid, &args, BPF_ANY);
	return 0;
}

SEC("uretprobe/SSL_read")
int uretprobe_ssl_read(struct pt_regs *ctx)
{
	__u32 pid = bpf_get_current_pid_tgid();
	struct ssl_read_args *args;
	struct tls_event e = {0};
	int ret = PT_REGS_RC(ctx);

	args = bpf_map_lookup_elem(&ssl_read_buf, &pid);
	if (!args)
		return 0;

	bpf_map_delete_elem(&ssl_read_buf, &pid);

	if (ret <= 0)
		return 0;

	e.timestamp = bpf_ktime_get_ns();
	e.pid = pid >> 32;
	e.len = (__u32)(ret > TLS_BUF_SIZE ? TLS_BUF_SIZE : ret);
	__builtin_memcpy(e.direction, "read", 5);

	bpf_probe_read_user_str(&e.buf, TLS_BUF_SIZE, args->buf);

	bpf_perf_event_output(ctx, &tls_events, BPF_F_CURRENT_CPU, &e, sizeof(e));
	return 0;
}

SEC("uprobe/SSL_do_handshake")
int uprobe_ssl_handshake_entry(struct pt_regs *ctx)
{
	struct ssl_ctx_info info = {0};
	__u32 pid = bpf_get_current_pid_tgid();

	info.ctx = (void *)PT_REGS_PARM1(ctx);
	info.pad = 0;

	bpf_map_update_elem(&ssl_ctx_map, &pid, &info, BPF_ANY);
	return 0;
}

SEC("uretprobe/SSL_do_handshake")
int uretprobe_ssl_handshake_exit(struct pt_regs *ctx)
{
	__u32 pid = bpf_get_current_pid_tgid();
	struct ssl_ctx_info *info;
	struct tls_key_event ke = {0};
	int ret = PT_REGS_RC(ctx);

	info = bpf_map_lookup_elem(&ssl_ctx_map, &pid);
	if (!info)
		return 0;

	bpf_map_delete_elem(&ssl_ctx_map, &pid);

	if (ret != 1)
		return 0;

	void *ssl = info->ctx;
	void *session = NULL;
	void *s3 = NULL;

	bpf_probe_read(&s3, sizeof(s3), ssl + 0x58);
	if (!s3)
		return 0;

	bpf_probe_read(&session, sizeof(session), s3 + 0x10);
	if (!session)
		return 0;

	bpf_probe_read(&ke.client_random, SSL_RAND_SIZE, s3 + 0x20);

	bpf_probe_read(&ke.session_id_len, sizeof(ke.session_id_len), session + 0x38);
	if (ke.session_id_len > SSL_SESSION_ID_SIZE)
		ke.session_id_len = SSL_SESSION_ID_SIZE;

	if (ke.session_id_len > 0)
		bpf_probe_read(&ke.session_id, ke.session_id_len, session + 0x20);

	bpf_probe_read(&ke.master_key, SSL_MASTER_KEY_SIZE, session + 0x58);

	ke.timestamp = bpf_ktime_get_ns();
	ke.pid = pid >> 32;
	ke.version = 0x0304;

	bpf_perf_event_output(ctx, &tls_key_events, BPF_F_CURRENT_CPU, &ke, sizeof(ke));
	return 0;
}

SEC("uprobe/SSL_CTX_new")
int uprobe_ssl_ctx_new(struct pt_regs *ctx)
{
	return 0;
}

SEC("uretprobe/SSL_CTX_new")
int uretprobe_ssl_ctx_new(struct pt_regs *ctx)
{
	void *ctx_ptr = (void *)PT_REGS_RC(ctx);
	if (!ctx_ptr)
		return 0;
	return 0;
}

char _license[] SEC("license") = "GPL";
