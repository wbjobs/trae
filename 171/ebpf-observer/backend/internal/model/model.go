package model

type TcpEvent struct {
	Timestamp     int64  `json:"timestamp"`
	EventType     string `json:"event_type"`
	Saddr         string `json:"saddr"`
	Daddr         string `json:"daddr"`
	Sport         uint16 `json:"sport"`
	Dport         uint16 `json:"dport"`
	SockIno       uint32 `json:"sock_ino"`
	Retransmits   uint32 `json:"retransmits"`
	TotalPackets  uint32 `json:"total_packets"`
	PacketLosses  uint32 `json:"packet_losses"`
	Srtt          uint32 `json:"srtt"`
	SrcService    string `json:"src_service,omitempty"`
	DstService    string `json:"dst_service,omitempty"`
}

type ServiceHealth struct {
	ServiceName    string  `json:"service_name"`
	HealthScore    float64 `json:"health_score"`
	RetransmitRate float64 `json:"retransmit_rate"`
	LossRate       float64 `json:"loss_rate"`
	AvgRtt         float64 `json:"avg_rtt_ms"`
	TotalConns     int64   `json:"total_conns"`
	LastUpdate     int64   `json:"last_update"`
}

type TopologyEdge struct {
	SrcService     string  `json:"src_service"`
	DstService     string  `json:"dst_service"`
	RetransmitRate float64 `json:"retransmit_rate"`
	AvgRtt         float64 `json:"avg_rtt_ms"`
	HealthScore    float64 `json:"health_score"`
}

type Topology struct {
	Nodes []TopologyNode `json:"nodes"`
	Edges []TopologyEdge `json:"edges"`
}

type TopologyNode struct {
	ServiceName string  `json:"service_name"`
	HealthScore float64 `json:"health_score"`
}

type TlsEvent struct {
	Timestamp int64  `json:"timestamp"`
	PID       uint32 `json:"pid"`
	Len       uint32 `json:"len"`
	Direction string `json:"direction"`
	Payload   string `json:"payload"`
}

type HttpObservation struct {
	Method      string `json:"method"`
	Path        string `json:"path"`
	Host        string `json:"host"`
	Direction   string `json:"direction"`
	ContentType string `json:"content_type,omitempty"`
	UserAgent   string `json:"user_agent,omitempty"`
	Timestamp   int64  `json:"timestamp"`
	PID         uint32 `json:"pid"`
	ServiceName string `json:"service_name,omitempty"`
}

type HttpStats struct {
	ServiceName  string            `json:"service_name"`
	MethodCounts map[string]int64  `json:"method_counts"`
	PathCounts   map[string]int64  `json:"path_counts"`
	TotalRequests int64            `json:"total_requests"`
	LastUpdate   int64             `json:"last_update"`
}
