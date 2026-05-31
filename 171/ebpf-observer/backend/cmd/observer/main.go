package main

import (
	"bufio"
	"context"
	"encoding/binary"
	"flag"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"ebpf-observer/backend/internal/model"
	"ebpf-observer/backend/internal/scraper"
	"ebpf-observer/backend/internal/server"
	"ebpf-observer/backend/internal/store"

	"github.com/cilium/ebpf/link"
	"github.com/cilium/ebpf/perf"
	"github.com/cilium/ebpf/rlimit"
)

//go:generate go run github.com/cilium/ebpf/cmd/bpf2go -cc clang bpf ../bpf/tcp_observ.c

type tcpEventRaw struct {
	Timestamp    uint64
	Saddr        uint32
	Daddr        uint32
	Sport        uint16
	Dport        uint16
	SockIno      uint32
	Retransmits  uint32
	TotalPackets uint32
	PacketLosses uint32
	SrttUs       uint32
	EventType    [16]byte
}

type tlsEventRaw struct {
	Timestamp uint64
	PID       uint32
	Len       uint32
	Direction [8]byte
	Buf       [256]byte
}

type tlsKeyEventRaw struct {
	Timestamp     uint64
	PID           uint32
	ClientRandom  [32]byte
	SessionID     [32]byte
	MasterKey     [48]byte
	SessionIDLen  uint32
	Version       uint32
}

func main() {
	var (
		addr          = flag.String("addr", ":8080", "HTTP server address")
		prometheusURL = flag.String("prometheus", "", "Prometheus URL for Linkerd metrics")
		simulate      = flag.Bool("simulate", false, "Run in simulation mode (no eBPF required)")
		opensslPath   = flag.String("openssl", "/usr/lib/x86_64-linux-gnu/libssl.so.3", "Path to OpenSSL libssl.so")
		targetPid     = flag.Int("pid", 0, "Target PID to attach uprobe (0 = all)")
		sslKeyLogFile = flag.String("keylog", "sslkeylog.log", "Path to write SSLKEYLOGFILE-format keys")
		flag.Parse()
	)

	if err := rlimit.RemoveMemlock(); err != nil {
		log.Fatalf("remove memlock: %v", err)
	}

	s := store.New(5 * time.Minute)
	scr := scraper.New(*prometheusURL)
	srv := server.New(*addr, s)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	if *prometheusURL != "" {
		go scr.Run(ctx, 30*time.Second)
	}

	if *simulate {
		go runSimulator(ctx, s, scr)
	} else {
		if err := runEbpf(ctx, s, scr, *opensslPath, *targetPid); err != nil {
			log.Printf("eBPF init failed, falling back to simulation: %v", err)
			go runSimulator(ctx, s, scr)
		}
	}

	go func() {
		if err := srv.Start(); err != nil {
			log.Fatalf("server: %v", err)
		}
	}()

	<-sigCh
	log.Println("shutting down...")
	srv.Shutdown(ctx)
}

func runEbpf(ctx context.Context, s *store.Store, scr *scraper.LinkerdScraper, opensslPath string, targetPid int) error {
	var objs bpfObjects
	if err := loadBpfObjects(&objs, nil); err != nil {
		return fmt.Errorf("load bpf: %w", err)
	}
	defer objs.Close()

	links := []link.Link{}

	l, err := link.Kprobe("tcp_retransmit_skb", objs.TcpRetransmitSkbEntry, nil)
	if err != nil {
		return fmt.Errorf("attach retransmit: %w", err)
	}
	links = append(links, l)

	l, err = link.Kprobe("tcp_drop", objs.TcpDropEntry, nil)
	if err != nil {
		return fmt.Errorf("attach drop: %w", err)
	}
	links = append(links, l)

	l, err = link.Kprobe("tcp_rcv_established", objs.TcpRcvEstablishedEntry, nil)
	if err != nil {
		return fmt.Errorf("attach rcv: %w", err)
	}
	links = append(links, l)

	var uprobeLinks []link.Link
	if opensslPath != "" {
		up, err := attachUprobes(objs, opensslPath, targetPid)
		if err != nil {
			log.Printf("uprobe attach skipped: %v", err)
		} else {
			uprobeLinks = up
			links = append(links, up...)
		}
	}

	defer func() {
		for _, l := range links {
			l.Close()
		}
	}()

	rd, err := perf.NewReader(objs.Events, 64*1024)
	if err != nil {
		return fmt.Errorf("perf reader: %w", err)
	}
	defer rd.Close()

	var tlsRd *perf.Reader
	var tlsKeyRd *perf.Reader
	if len(uprobeLinks) > 0 {
		tlsRd, err = perf.NewReader(objs.TlsEvents, 64*1024)
		if err != nil {
			log.Printf("tls perf reader: %v", err)
		} else {
			defer tlsRd.Close()
			go processTlsEvents(ctx, tlsRd, s, scr)
		}

		tlsKeyRd, err = perf.NewReader(objs.TlsKeyEvents, 16*1024)
		if err != nil {
			log.Printf("tls key perf reader: %v", err)
		} else {
			defer tlsKeyRd.Close()
			go processTlsKeyEvents(ctx, tlsKeyRd, *sslKeyLogFile)
		}
	}

	go processEvents(ctx, rd, s, scr)
	log.Println("eBPF programs attached successfully")
	return nil
}

func attachUprobes(objs bpfObjects, opensslPath string, targetPid int) ([]link.Link, error) {
	var links []link.Link

	opts := &link.UprobeOptions{}
	if targetPid > 0 {
		opts.PID = targetPid
	}

	up, err := link.Uprobe(opensslPath, "SSL_write", objs.UprobeSslWrite, opts)
	if err != nil {
		return nil, fmt.Errorf("attach SSL_write uprobe: %w", err)
	}
	links = append(links, up)

	uret, err := link.Uretprobe(opensslPath, "SSL_write", objs.UretprobeSslWrite, opts)
	if err != nil {
		for _, l := range links {
			l.Close()
		}
		return nil, fmt.Errorf("attach SSL_write uretprobe: %w", err)
	}
	links = append(links, uret)

	up, err = link.Uprobe(opensslPath, "SSL_read", objs.UprobeSslRead, opts)
	if err != nil {
		for _, l := range links {
			l.Close()
		}
		return nil, fmt.Errorf("attach SSL_read uprobe: %w", err)
	}
	links = append(links, up)

	uret, err = link.Uretprobe(opensslPath, "SSL_read", objs.UretprobeSslRead, opts)
	if err != nil {
		for _, l := range links {
			l.Close()
		}
		return nil, fmt.Errorf("attach SSL_read uretprobe: %w", err)
	}
	links = append(links, uret)

	up, err = link.Uprobe(opensslPath, "SSL_do_handshake", objs.UprobeSslHandshakeEntry, opts)
	if err != nil {
		log.Printf("SSL_do_handshake uprobe not available: %v", err)
	} else {
		links = append(links, up)
	}

	uret, err = link.Uretprobe(opensslPath, "SSL_do_handshake", objs.UretprobeSslHandshakeExit, opts)
	if err != nil {
		log.Printf("SSL_do_handshake uretprobe not available: %v", err)
	} else {
		links = append(links, uret)
	}

	log.Printf("TLS uprobes attached to %s", opensslPath)
	return links, nil
}

func processEvents(ctx context.Context, rd *perf.Reader, s *store.Store, scr *scraper.LinkerdScraper) {
	var raw tcpEventRaw
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		rec, err := rd.Read()
		if err != nil {
			log.Printf("perf read: %v", err)
			continue
		}
		if rec.LostSamples != 0 {
			log.Printf("lost %d samples", rec.LostSamples)
		}

		if len(rec.RawSample) < binary.Size(raw) {
			continue
		}

		b := rec.RawSample
		raw.Timestamp = binary.LittleEndian.Uint64(b[0:8])
		raw.Saddr = binary.LittleEndian.Uint32(b[8:12])
		raw.Daddr = binary.LittleEndian.Uint32(b[12:16])
		raw.Sport = binary.LittleEndian.Uint16(b[16:18])
		raw.Dport = binary.LittleEndian.Uint16(b[18:20])
		raw.SockIno = binary.LittleEndian.Uint32(b[20:24])
		raw.Retransmits = binary.LittleEndian.Uint32(b[24:28])
		raw.TotalPackets = binary.LittleEndian.Uint32(b[28:32])
		raw.PacketLosses = binary.LittleEndian.Uint32(b[32:36])
		raw.SrttUs = binary.LittleEndian.Uint32(b[36:40])
		copy(raw.EventType[:], b[40:56])

		ev := convertEvent(&raw, scr)
		s.RecordEvent(ev)
	}
}

func processTlsEvents(ctx context.Context, rd *perf.Reader, s *store.Store, scr *scraper.LinkerdScraper) {
	var raw tlsEventRaw
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		rec, err := rd.Read()
		if err != nil {
			log.Printf("tls perf read: %v", err)
			continue
		}
		if rec.LostSamples != 0 {
			log.Printf("tls lost %d samples", rec.LostSamples)
		}

		if len(rec.RawSample) < 52 {
			continue
		}

		b := rec.RawSample
		raw.Timestamp = binary.LittleEndian.Uint64(b[0:8])
		raw.PID = binary.LittleEndian.Uint32(b[8:12])
		raw.Len = binary.LittleEndian.Uint32(b[12:16])
		copy(raw.Direction[:], b[16:24])
		copy(raw.Buf[:], b[24:280])

		handleTlsEvent(&raw, s, scr)
	}
}

func handleTlsEvent(raw *tlsEventRaw, s *store.Store, scr *scraper.LinkerdScraper) {
	direction := string(raw.Direction[:])
	for i, c := range direction {
		if c == 0 {
			direction = direction[:i]
			break
		}
	}

	payload := string(raw.Buf[:raw.Len])
	for i := 0; i < len(payload); i++ {
		if payload[i] == 0 {
			payload = payload[:i]
			break
		}
	}

	obs := parseHttpRequest(payload, direction, raw.PID, int64(raw.Timestamp))
	if obs != nil {
		s.RecordHttpObservation(obs)
	}
}

func processTlsKeyEvents(ctx context.Context, rd *perf.Reader, keyLogFile string) {
	var raw tlsKeyEventRaw
	expectedSize := binary.Size(raw)

	f, err := os.OpenFile(keyLogFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		log.Printf("open keylog file: %v", err)
		return
	}
	defer f.Close()

	log.Printf("TLS key logging enabled, writing to %s", keyLogFile)

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		rec, err := rd.Read()
		if err != nil {
			log.Printf("tls key perf read: %v", err)
			continue
		}
		if rec.LostSamples != 0 {
			log.Printf("tls key lost %d samples", rec.LostSamples)
		}

		if len(rec.RawSample) < expectedSize {
			continue
		}

		b := rec.RawSample
		raw.Timestamp = binary.LittleEndian.Uint64(b[0:8])
		raw.PID = binary.LittleEndian.Uint32(b[8:12])
		copy(raw.ClientRandom[:], b[12:44])
		copy(raw.SessionID[:], b[44:76])
		copy(raw.MasterKey[:], b[76:124])
		raw.SessionIDLen = binary.LittleEndian.Uint32(b[124:128])
		raw.Version = binary.LittleEndian.Uint32(b[128:132])

		writeNssKeyLog(f, &raw)
	}
}

func writeNssKeyLog(f *os.File, ke *tlsKeyEventRaw) {
	line := fmt.Sprintf("CLIENT_RANDOM %s %s\n",
		fmt.Sprintf("%x", ke.ClientRandom[:32]),
		fmt.Sprintf("%x", ke.MasterKey[:48]))

	if _, err := f.WriteString(line); err != nil {
		log.Printf("write keylog: %v", err)
	} else {
		log.Printf("TLS key logged: pid=%d client_random=%x...", ke.PID, ke.ClientRandom[:8])
	}
}

func parseHttpRequest(payload, direction string, pid uint32, timestamp int64) *model.HttpObservation {
	reader := bufio.NewReader(strings.NewReader(payload))
	firstLine, err := reader.ReadString('\n')
	if err != nil || len(firstLine) == 0 {
		return nil
	}

	firstLine = strings.TrimSpace(firstLine)
	parts := strings.SplitN(firstLine, " ", 3)
	if len(parts) < 2 {
		return nil
	}

	method := parts[0]
	validMethods := map[string]bool{
		"GET": true, "POST": true, "PUT": true, "DELETE": true,
		"PATCH": true, "HEAD": true, "OPTIONS": true, "CONNECT": true, "TRACE": true,
	}
	if !validMethods[method] {
		return nil
	}

	path := parts[1]
	host := ""
	contentType := ""
	userAgent := ""

	for {
		line, err := reader.ReadString('\n')
		if err != nil || line == "\r\n" || line == "\n" {
			break
		}
		line = strings.TrimSpace(line)
		if strings.HasPrefix(strings.ToLower(line), "host:") {
			host = strings.TrimSpace(line[5:])
		}
		if strings.HasPrefix(strings.ToLower(line), "content-type:") {
			contentType = strings.TrimSpace(line[13:])
		}
		if strings.HasPrefix(strings.ToLower(line), "user-agent:") {
			userAgent = strings.TrimSpace(line[11:])
		}
	}

	return &model.HttpObservation{
		Method:      method,
		Path:        path,
		Host:        host,
		Direction:   direction,
		ContentType: contentType,
		UserAgent:   userAgent,
		Timestamp:   timestamp,
		PID:         pid,
	}
}

func convertEvent(raw *tcpEventRaw, scr *scraper.LinkerdScraper) *model.TcpEvent {
	eventType := string(raw.EventType[:])
	for i, c := range eventType {
		if c == 0 {
			eventType = eventType[:i]
			break
		}
	}

	srcIP := intToIP(raw.Saddr)
	dstIP := intToIP(raw.Daddr)

	return &model.TcpEvent{
		Timestamp:    int64(raw.Timestamp),
		EventType:    eventType,
		Saddr:        srcIP,
		Daddr:        dstIP,
		Sport:        raw.Sport,
		Dport:        raw.Dport,
		SockIno:      raw.SockIno,
		Retransmits:  raw.Retransmits,
		TotalPackets: raw.TotalPackets,
		PacketLosses: raw.PacketLosses,
		Srtt:         raw.SrttUs,
		SrcService:   scr.GetServiceName(srcIP),
		DstService:   scr.GetServiceName(dstIP),
	}
}

func intToIP(ip uint32) string {
	return net.IPv4(byte(ip), byte(ip>>8), byte(ip>>16), byte(ip>>24)).String()
}

func runSimulator(ctx context.Context, s *store.Store, scr *scraper.LinkerdScraper) {
	services := []string{
		"frontend", "backend-api", "payment-service",
		"order-service", "inventory-service", "user-service",
		"notification-service", "search-service",
	}

	for _, svc := range services {
		ip := fmt.Sprintf("10.0.%d.%d", len(svc)%256, len(svc))
		scr.SetMapping(ip, svc)
	}

	topology := [][2]int{
		{0, 1}, {1, 2}, {1, 3}, {1, 4}, {3, 5}, {3, 6}, {0, 7},
	}

	httpMethods := []string{"GET", "POST", "PUT", "DELETE", "PATCH"}
	httpPaths := map[int][]string{
		0: {"/", "/api", "/static/js/bundle.js", "/favicon.ico"},
		1: {"/api/v1/users", "/api/v1/orders", "/api/v1/products", "/api/v1/payments"},
		2: {"/api/v1/charge", "/api/v1/refund"},
		3: {"/api/v1/orders", "/api/v1/orders/:id"},
		4: {"/api/v1/inventory", "/api/v1/stock/:id"},
		5: {"/api/v1/users", "/api/v1/users/:id", "/api/v1/auth"},
		6: {"/api/v1/notify", "/api/v1/email", "/api/v1/sms"},
		7: {"/api/v1/search", "/api/v1/suggest"},
	}

	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	eventTypes := []string{"rtt_update", "rtt_update", "rtt_update", "retransmit", "packet_loss"}

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			for _, pair := range topology {
				src := services[pair[0]]
				dst := services[pair[1]]
				srcIP := fmt.Sprintf("10.0.%d.%d", len(src)%256, len(src))
				dstIP := fmt.Sprintf("10.0.%d.%d", len(dst)%256, len(dst))

				ev := &model.TcpEvent{
					Timestamp:    time.Now().UnixNano(),
					EventType:    eventTypes[int(time.Now().UnixNano())%len(eventTypes)],
					Saddr:        srcIP,
					Daddr:        dstIP,
					Sport:        uint16(4000 + pair[0]*100),
					Dport:        uint16(4000 + pair[1]*100),
					Retransmits:  uint32(int(time.Now().UnixNano()) % 5),
					TotalPackets: uint32(100 + int(time.Now().UnixNano())%900),
					PacketLosses: uint32(int(time.Now().UnixNano()) % 3),
					Srtt:         uint32(5000 + int(time.Now().UnixNano())%200000),
					SrcService:   src,
					DstService:   dst,
				}
				s.RecordEvent(ev)

				if int(time.Now().UnixNano())%3 == 0 {
					paths := httpPaths[pair[1]]
					if len(paths) > 0 {
						path := paths[int(time.Now().UnixNano())%len(paths)]
						obs := &model.HttpObservation{
							Method:      httpMethods[int(time.Now().UnixNano())%len(httpMethods)],
							Path:        path,
							Host:        fmt.Sprintf("%s.internal", dst),
							Direction:   "write",
							ContentType: "application/json",
							Timestamp:   time.Now().UnixNano(),
							PID:         uint32(1000 + pair[1]),
							ServiceName: src,
						}
						s.RecordHttpObservation(obs)
					}
				}
			}
		}
	}
}
