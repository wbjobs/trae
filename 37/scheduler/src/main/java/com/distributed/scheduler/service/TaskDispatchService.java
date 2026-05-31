package com.distributed.scheduler.service;

import com.distributed.scheduler.common.TaskStatus;
import com.distributed.scheduler.entity.ExecutorRegistry;
import com.distributed.scheduler.entity.TaskDefinition;
import com.distributed.scheduler.entity.TaskInstance;
import com.distributed.scheduler.repository.TaskDefinitionRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class TaskDispatchService {

    private final RedisTemplate<String, Object> redisTemplate;
    private final TaskService taskService;
    private final ExecutorService executorService;
    private final TaskDefinitionRepository taskDefinitionRepository;
    private final PriorityQueueService priorityQueueService;
    private final PreemptionService preemptionService;
    private final ObjectMapper objectMapper;

    @Value("${scheduler.task.queue-prefix:task:queue:}")
    private String queuePrefix;

    @Value("${scheduler.task.use-priority-queue:true}")
    private boolean usePriorityQueue;

    @Transactional
    public void dispatchPendingTasks() {
        List<TaskInstance> pendingInstances = taskService.getPendingTasksOrderedByPriority();
        
        for (TaskInstance instance : pendingInstances) {
            try {
                dispatchTask(instance);
            } catch (Exception e) {
                log.error("Failed to dispatch task instance: {}", instance.getId(), e);
            }
        }
    }

    @Transactional
    public void dispatchTask(TaskInstance instance) {
        TaskDefinition task = taskDefinitionRepository.findById(instance.getTaskId())
                .orElseThrow(() -> new RuntimeException("Task not found: " + instance.getTaskId()));

        boolean preempted = preemptionService.checkAndPreempt(instance);
        if (preempted) {
            log.info("Task instance {} preempted a lower priority task", instance.getId());
            return;
        }

        ExecutorRegistry executor = executorService.selectExecutor(task.getTaskType());
        
        Map<String, Object> taskMessage = new HashMap<>();
        taskMessage.put("taskInstanceId", instance.getId());
        taskMessage.put("taskId", task.getId());
        taskMessage.put("taskName", task.getTaskName());
        taskMessage.put("taskType", task.getTaskType());
        taskMessage.put("params", instance.getParams());
        taskMessage.put("traceId", instance.getTraceId());
        taskMessage.put("maxRetryTimes", task.getMaxRetryTimes());
        taskMessage.put("retryIntervalSeconds", task.getRetryIntervalSeconds());
        taskMessage.put("timeoutSeconds", task.getTimeoutSeconds());
        taskMessage.put("priority", task.getPriority());
        taskMessage.put("preemptible", task.getPreemptible());
        taskMessage.put("checkpointData", instance.getCheckpointData());

        try {
            String message = objectMapper.writeValueAsString(taskMessage);
            
            if (usePriorityQueue) {
                priorityQueueService.enqueueTaskMessage(executor.getId(), message, task.getPriority());
            } else {
                String queueName = queuePrefix + executor.getId();
                redisTemplate.opsForList().leftPush(queueName, message);
            }
            
            taskService.assignExecutor(instance.getId(), executor.getId());
            log.info("Dispatched task instance {} (priority {}) to executor {} (queue: {})", 
                instance.getId(), task.getPriority(), executor.getId(), 
                usePriorityQueue ? "priority-queue" : queueName);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize task message", e);
        }
    }

    @Transactional
    public void handleTaskResult(Long instanceId, TaskStatus status, String result, String errorMessage) {
        taskService.updateTaskInstanceStatus(instanceId, status, result, errorMessage);
        log.info("Task instance {} completed with status: {}", instanceId, status);
    }

    @Transactional
    public boolean retryTask(Long instanceId) {
        TaskInstance instance = taskService.getTaskInstance(instanceId)
                .orElseThrow(() -> new RuntimeException("Task instance not found: " + instanceId));

        TaskDefinition task = taskDefinitionRepository.findById(instance.getTaskId())
                .orElseThrow(() -> new RuntimeException("Task not found: " + instance.getTaskId()));

        if (instance.getRetryTimes() >= task.getMaxRetryTimes()) {
            log.warn("Task instance {} has reached max retry times ({})", instanceId, task.getMaxRetryTimes());
            return false;
        }

        instance.setRetryTimes(instance.getRetryTimes() + 1);
        instance.setStatus(TaskStatus.RETRYING.name());
        instance.setExecutorId(null);
        instance.setStartedAt(null);
        instance.setCompletedAt(null);
        instance.setTimeoutAt(null);
        instance.setScheduledAt(java.time.LocalDateTime.now());
        
        taskService.updateTaskInstanceStatus(instanceId, TaskStatus.PENDING, null, null);
        
        log.info("Task instance {} scheduled for retry (attempt {}/{})", 
            instanceId, instance.getRetryTimes(), task.getMaxRetryTimes());
        return true;
    }

    @Transactional
    public boolean suspendTask(Long instanceId, String checkpointData) {
        TaskInstance instance = taskService.getTaskInstance(instanceId)
                .orElseThrow(() -> new RuntimeException("Task instance not found: " + instanceId));

        if (!TaskStatus.RUNNING.name().equals(instance.getStatus())) {
            log.warn("Cannot suspend task {}: status is {}, expected RUNNING", instanceId, instance.getStatus());
            return false;
        }

        preemptionService.handleSuspendedTaskCompletion(instanceId, checkpointData);
        instance.setStatus(TaskStatus.SUSPENDED.name());
        instance.setSuspendedAt(java.time.LocalDateTime.now());
        taskService.updateTaskInstanceStatus(instanceId, TaskStatus.SUSPENDED, null, null);
        
        log.info("Task instance {} suspended with checkpoint", instanceId);
        return true;
    }

    @Transactional
    public boolean resumeTask(Long instanceId) {
        return preemptionService.resumeTask(instanceId);
    }

    public List<TaskInstance> getSuspendedTasks() {
        return preemptionService.getSuspendedTasks();
    }
}
