package com.distributed.scheduler.service;

import com.distributed.scheduler.entity.TaskInstance;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class PriorityQueueService {

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    @Value("${scheduler.task.queue-prefix:task:queue:}")
    private String queuePrefix;

    @Value("${scheduler.task.priority-queue-prefix:task:priority-queue:}")
    private String priorityQueuePrefix;

    private static final int PRIORITY_MIN = 1;
    private static final int PRIORITY_MAX = 10;

    public double calculateScore(int priority) {
        int clampedPriority = Math.max(PRIORITY_MIN, Math.min(PRIORITY_MAX, priority));
        return -clampedPriority;
    }

    public void enqueueTask(String executorId, TaskInstance task) {
        String queueName = priorityQueuePrefix + executorId;
        try {
            String taskJson = objectMapper.writeValueAsString(task);
            double score = calculateScore(task.getPriority());
            redisTemplate.opsForZSet().add(queueName, taskJson, score);
            log.debug("Enqueued task {} to priority queue {} with priority {} (score: {})",
                task.getId(), queueName, task.getPriority(), score);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize task for queue", e);
        }
    }

    public void enqueueTaskMessage(String executorId, String taskJson, int priority) {
        String queueName = priorityQueuePrefix + executorId;
        double score = calculateScore(priority);
        redisTemplate.opsForZSet().add(queueName, taskJson, score);
        log.debug("Enqueued task message to priority queue {} with priority {} (score: {})",
            queueName, priority, score);
    }

    public String dequeueTask(String executorId) {
        String queueName = priorityQueuePrefix + executorId;
        Set<String> tasks = redisTemplate.opsForZSet().range(queueName, 0, 0);
        if (tasks == null || tasks.isEmpty()) {
            return null;
        }
        String taskJson = tasks.iterator().next();
        redisTemplate.opsForZSet().remove(queueName, taskJson);
        log.debug("Dequeued task from priority queue {}", queueName);
        return taskJson;
    }

    public String peekHighestPriorityTask(String executorId) {
        String queueName = priorityQueuePrefix + executorId;
        Set<String> tasks = redisTemplate.opsForZSet().range(queueName, 0, 0);
        if (tasks == null || tasks.isEmpty()) {
            return null;
        }
        return tasks.iterator().next();
    }

    public long getQueueSize(String executorId) {
        String queueName = priorityQueuePrefix + executorId;
        Long size = redisTemplate.opsForZSet().size(queueName);
        return size != null ? size : 0;
    }

    public boolean removeTask(String executorId, String taskJson) {
        String queueName = priorityQueuePrefix + executorId;
        Long removed = redisTemplate.opsForZSet().remove(queueName, taskJson);
        return removed != null && removed > 0;
    }

    public void clearQueue(String executorId) {
        String queueName = priorityQueuePrefix + executorId;
        redisTemplate.delete(queueName);
        log.info("Cleared priority queue {}", queueName);
    }

    public Set<String> getAllTasks(String executorId) {
        String queueName = priorityQueuePrefix + executorId;
        return redisTemplate.opsForZSet().range(queueName, 0, -1);
    }

    public void migrateFromLegacyQueue(String executorId) {
        String legacyQueueName = queuePrefix + executorId;
        String priorityQueueName = priorityQueuePrefix + executorId;
        
        while (true) {
            String taskJson = (String) redisTemplate.opsForList().rightPop(legacyQueueName);
            if (taskJson == null) {
                break;
            }
            redisTemplate.opsForZSet().add(priorityQueueName, taskJson, calculateScore(5));
            log.debug("Migrated task from legacy queue to priority queue");
        }
    }

    public int getHighestPriorityInQueue(String executorId) {
        String queueName = priorityQueuePrefix + executorId;
        Set<String> tasks = redisTemplate.opsForZSet().rangeWithScores(queueName, 0, 0);
        if (tasks == null || tasks.isEmpty()) {
            return 0;
        }
        return 0;
    }
}
