package ebpf

import (
	"fmt"
	"net"
	"time"

	"github.com/cilium/ebpf"
	"github.com/cilium/ebpf/link"
	"github.com/cilium/ebpf/perf"
)

//go:generate go run github.com/cilium/ebpf/cmd/bpf2go -cc clang -cflags "-O2 -g -Wall -Werror" bpf ../../bpf/http_mirror.c -- -I./bpf

type MirrorEBPF struct {
	objs    bpfObjects
	reader  *perf.Reader
	iface   *net.Interface
	tcLink  link.Link
}

type Event struct {
	SrcIP      [4]byte
	DstIP      [4]byte
	SrcPort    uint16
	DstPort    uint16
	PayloadLen uint16
	Payload    [1500]byte
}

func New(ifaceName string) (*MirrorEBPF, error) {
	iface, err := net.InterfaceByName(ifaceName)
	if err != nil {
		return nil, fmt.Errorf("interface %s not found: %w", ifaceName, err)
	}

	objs := bpfObjects{}
	if err := loadBpfObjects(&objs, nil); err != nil {
		return nil, fmt.Errorf("loading eBPF objects: %w", err)
	}

	return &MirrorEBPF{
		objs:  objs,
		iface: iface,
	}, nil
}

func (m *MirrorEBPF) Attach() error {
	var err error
	m.tcLink, err = link.AttachTCX(link.TCXOptions{
		Interface: m.iface.Index,
		Program:   m.objs.MirrorHttp,
		Attach:    ebpf.AttachTCXEgress,
	})
	if err != nil {
		return fmt.Errorf("attaching TC egress: %w", err)
	}

	return nil
}

func (m *MirrorEBPF) NewReader() (*perf.Reader, error) {
	var err error
	m.reader, err = perf.NewReader(m.objs.Events, 4096)
	if err != nil {
		return nil, fmt.Errorf("creating perf reader: %w", err)
	}
	return m.reader, nil
}

func (m *MirrorEBPF) Close() error {
	if m.reader != nil {
		m.reader.Close()
	}
	if m.tcLink != nil {
		m.tcLink.Close()
	}
	return m.objs.Close()
}

func (m *MirrorEBPF) ReadEvent(timeout time.Duration) (*Event, error) {
	rec, err := m.reader.Read()
	if err != nil {
		return nil, err
	}

	var event Event
	if err := rec.RawSample.Unmarshal(&event); err != nil {
		return nil, fmt.Errorf("unmarshaling event: %w", err)
	}

	return &event, nil
}

func (m *MirrorEBPF) Events() *perf.Reader {
	return m.reader
}
