package config

import (
	"time"
)

type Config struct {
	RTSPURL        string
	SegmentDir     string
	SegmentDuration time.Duration
	CacheDuration  time.Duration
	HTTPPort       string
	FFmpegPath     string
}

func Default() *Config {
	return &Config{
		RTSPURL:        "rtsp://localhost:8554/live",
		SegmentDir:     "./segments",
		SegmentDuration: 10 * time.Second,
		CacheDuration:  5 * time.Minute,
		HTTPPort:       ":8080",
		FFmpegPath:     "ffmpeg",
	}
}
