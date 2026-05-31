package parser

import (
	"fmt"
	"strings"
)

const SharedSubscriptionPrefix = "$share"

type SharedSubscription struct {
	Group       string
	TopicFilter string
	RawTopic    string
}

func ParseSharedSubscription(topic string) (*SharedSubscription, error) {
	if !strings.HasPrefix(topic, SharedSubscriptionPrefix) {
		return nil, fmt.Errorf("topic %s is not a shared subscription", topic)
	}

	parts := strings.SplitN(topic, "/", 3)
	if len(parts) < 3 {
		return nil, fmt.Errorf("invalid shared subscription format: %s, expected $share/group/topic", topic)
	}

	group := parts[1]
	topicFilter := parts[2]

	if group == "" {
		return nil, fmt.Errorf("group name cannot be empty in shared subscription: %s", topic)
	}
	if topicFilter == "" {
		return nil, fmt.Errorf("topic filter cannot be empty in shared subscription: %s", topic)
	}

	return &SharedSubscription{
		Group:       group,
		TopicFilter: topicFilter,
		RawTopic:    topic,
	}, nil
}

func IsSharedSubscription(topic string) bool {
	return strings.HasPrefix(topic, SharedSubscriptionPrefix+"/")
}

func TopicMatchesFilter(topic, filter string) bool {
	if filter == "#" {
		return true
	}
	topicParts := strings.Split(topic, "/")
	filterParts := strings.Split(filter, "/")

	for i, fp := range filterParts {
		if fp == "#" {
			return true
		}
		if i >= len(topicParts) {
			return false
		}
		if fp != "+" && fp != topicParts[i] {
			return false
		}
	}

	return len(topicParts) == len(filterParts)
}
