package docker

import (
	"bytes"
	"context"
	"encoding/binary"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/docker/docker/api/types/container"
	dockerclient "github.com/docker/docker/client"
)

type LogEntry struct {
	Container string
	Timestamp string
	Content   string
}

type LogStreamer struct {
	client  *dockerclient.Client
	entries chan LogEntry
	errors  chan error
}

func NewLogStreamer() (*LogStreamer, error) {
	client, err := dockerclient.NewClientWithOpts(dockerclient.FromEnv, dockerclient.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("failed to create docker client: %w", err)
	}
	return &LogStreamer{
		client:  client,
		entries: make(chan LogEntry, 1000),
		errors:  make(chan error, 10),
	}, nil
}

func (ls *LogStreamer) Entries() <-chan LogEntry {
	return ls.entries
}

func (ls *LogStreamer) Errors() <-chan error {
	return ls.errors
}

func (ls *LogStreamer) StreamContainerLogs(ctx context.Context, containerID string, showTimestamp bool, since string) error {
	containerName, err := ls.resolveContainerName(ctx, containerID)
	if err != nil {
		containerName = containerID
	}

	reader, err := ls.client.ContainerLogs(ctx, containerID, container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Follow:     true,
		Timestamps: showTimestamp,
		Since:      since,
	})
	if err != nil {
		return fmt.Errorf("failed to get logs for container %s: %w", containerID, err)
	}

	go func() {
		defer reader.Close()
		ls.parseDockerLogs(ctx, containerName, reader, showTimestamp)
	}()

	return nil
}

func (ls *LogStreamer) resolveContainerName(ctx context.Context, id string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	info, err := ls.client.ContainerInspect(ctx, id)
	if err != nil {
		return "", err
	}
	name := strings.TrimPrefix(info.Name, "/")
	return name, nil
}

func (ls *LogStreamer) parseDockerLogs(ctx context.Context, containerName string, reader io.Reader, showTimestamp bool) {
	header := make([]byte, 8)
	var lineBuf bytes.Buffer

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		_, err := io.ReadFull(reader, header)
		if err != nil {
			if err != io.EOF && err != io.ErrUnexpectedEOF {
				select {
				case ls.errors <- fmt.Errorf("error reading header for %s: %w", containerName, err):
				default:
				}
			}
			return
		}

		streamType := header[0]
		if streamType > 2 {
			continue
		}

		payloadSize := binary.BigEndian.Uint32(header[4:8])
		if payloadSize == 0 {
			continue
		}

		payload := make([]byte, payloadSize)
		_, err = io.ReadFull(reader, payload)
		if err != nil {
			select {
			case ls.errors <- fmt.Errorf("error reading payload for %s: %w", containerName, err):
			default:
			}
			return
		}

		lineBuf.Write(payload)

		for {
			newlineIdx := bytes.IndexByte(lineBuf.Bytes(), '\n')
			if newlineIdx == -1 {
				break
			}

			rawLine := lineBuf.Next(newlineIdx + 1)
			line := strings.TrimRight(string(rawLine), "\r\n")

			entry := LogEntry{
				Container: containerName,
			}

			if showTimestamp {
				parts := strings.SplitN(line, " ", 2)
				if len(parts) >= 2 {
					entry.Timestamp = parts[0]
					entry.Content = parts[1]
				} else {
					entry.Content = line
				}
			} else {
				entry.Content = line
			}

			select {
			case ls.entries <- entry:
			case <-ctx.Done():
				return
			}
		}
	}
}

func (ls *LogStreamer) Close() error {
	return ls.client.Close()
}

func ListContainers(ctx context.Context) ([]string, error) {
	client, err := dockerclient.NewClientWithOpts(dockerclient.FromEnv, dockerclient.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("failed to create docker client: %w", err)
	}
	defer client.Close()

	containers, err := client.ContainerList(ctx, container.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list containers: %w", err)
	}

	names := make([]string, 0, len(containers))
	for _, c := range containers {
		if len(c.Names) > 0 {
			name := strings.TrimPrefix(c.Names[0], "/")
			names = append(names, name)
		}
	}
	return names, nil
}
