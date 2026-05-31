package metrics

import (
	"context"
	"fmt"
	"time"

	"github.com/prometheus/common/model"

	"thanos-downsampler/pkg/cache"
	"thanos-downsampler/pkg/config"
	"thanos-downsampler/pkg/downsampler"
	"thanos-downsampler/pkg/thanos"
)

type Service struct {
	thanosClient *thanos.Client
	cacheService *cache.Service
	config       *config.Config
}

func NewService(thanosClient *thanos.Client, cacheService *cache.Service, cfg *config.Config) *Service {
	return &Service{
		thanosClient: thanosClient,
		cacheService: cacheService,
		config:       cfg,
	}
}

type QueryOptions struct {
	Query       string
	Start       time.Time
	End         time.Time
	Step        time.Duration
	Granularity string
	ForceRaw    bool
}

type QueryResult struct {
	Data       []model.SampleStream
	Downsampled bool
	Granularity string
	FromCache  bool
}

func (s *Service) QueryRange(ctx context.Context, opts QueryOptions) (*QueryResult, error) {
	duration := opts.End.Sub(opts.Start)
	autoThreshold := time.Duration(s.config.Downsampling.AutoThresholdDays) * 24 * time.Hour

	shouldDownsample := !opts.ForceRaw && duration > autoThreshold
	granularity := opts.Granularity
	if granularity == "" {
		granularity = s.config.Downsampling.DefaultGranularity
	}

	if shouldDownsample {
		return s.queryDownsampled(ctx, opts, granularity)
	}

	return s.queryRaw(ctx, opts)
}

func (s *Service) queryRaw(ctx context.Context, opts QueryOptions) (*QueryResult, error) {
	cacheKey := cache.CacheKey{
		Query:       opts.Query,
		Start:       opts.Start,
		End:         opts.End,
		Step:        opts.Step,
		Granularity: "raw",
	}

	if cached, found := s.cacheService.Get(cacheKey); found {
		return &QueryResult{
			Data:       cached.Data,
			Downsampled: false,
			Granularity: "raw",
			FromCache:  true,
		}, nil
	}

	data, err := s.thanosClient.QueryRange(ctx, opts.Query, opts.Start, opts.End, opts.Step)
	if err != nil {
		return nil, fmt.Errorf("failed to query raw data: %w", err)
	}

	result := &QueryResult{
		Data:       data,
		Downsampled: false,
		Granularity: "raw",
		FromCache:  false,
	}

	s.cacheService.Set(cacheKey, &cache.CachedResult{
		Data:       data,
		QueryTime:  time.Now(),
		Downsampled: false,
		Granularity: "raw",
	})

	return result, nil
}

func (s *Service) queryDownsampled(ctx context.Context, opts QueryOptions, granularity string) (*QueryResult, error) {
	granularityDuration, err := config.GranularityToDuration(granularity)
	if err != nil {
		return nil, err
	}

	cacheKey := cache.CacheKey{
		Query:       opts.Query,
		Start:       opts.Start,
		End:         opts.End,
		Step:        granularityDuration,
		Granularity: granularity,
	}

	if cached, found := s.cacheService.Get(cacheKey); found {
		return &QueryResult{
			Data:       cached.Data,
			Downsampled: true,
			Granularity: granularity,
			FromCache:  true,
		}, nil
	}

	rawStep := 5 * time.Minute
	rawData, err := s.thanosClient.QueryRange(ctx, opts.Query, opts.Start, opts.End, rawStep)
	if err != nil {
		return nil, fmt.Errorf("failed to query raw data for downsampling: %w", err)
	}

	targetPoints, err := downsampler.CalculateTargetPoints(opts.Start, opts.End, granularity)
	if err != nil {
		return nil, err
	}

	downsampledData := make([]model.SampleStream, len(rawData))
	for i, stream := range rawData {
		samplePairs := make([]downsampler.SamplePair, len(stream.Values))
		for j, v := range stream.Values {
			samplePairs[j] = downsampler.SamplePair{
				Timestamp: v.Timestamp,
				Value:     v.Value,
			}
		}

		downsampledPairs := downsampler.LTTBSamplePair(samplePairs, targetPoints)

		modelPairs := make([]model.SamplePair, len(downsampledPairs))
		for j, v := range downsampledPairs {
			modelPairs[j] = model.SamplePair{
				Timestamp: v.Timestamp,
				Value:     v.Value,
			}
		}

		downsampledData[i] = model.SampleStream{
			Metric: stream.Metric,
			Values: modelPairs,
		}
	}

	result := &QueryResult{
		Data:       downsampledData,
		Downsampled: true,
		Granularity: granularity,
		FromCache:  false,
	}

	s.cacheService.Set(cacheKey, &cache.CachedResult{
		Data:       downsampledData,
		QueryTime:  time.Now(),
		Downsampled: true,
		Granularity: granularity,
	})

	return result, nil
}

func (s *Service) Query(ctx context.Context, query string, ts time.Time) ([]model.SampleStream, error) {
	return s.thanosClient.Query(ctx, query, ts)
}

func (s *Service) LabelNames(ctx context.Context, start, end time.Time) ([]string, error) {
	return s.thanosClient.LabelNames(ctx, start, end)
}

func (s *Service) LabelValues(ctx context.Context, labelName string, start, end time.Time) ([]string, error) {
	return s.thanosClient.LabelValues(ctx, labelName, start, end)
}
