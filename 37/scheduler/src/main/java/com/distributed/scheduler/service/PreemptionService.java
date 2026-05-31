package com.distributed.scheduler.service;

import com.distributed.scheduler.common.TaskStatus;
import com.distributed.scheduler.entity.ExecutorRegistry;
import com.distributed.scheduler.entity.TaskDefinition;
import com.distributed.scheduler.entity.TaskInstance;
import com.distributed.scheduler.repository.TaskDefinitionRepository;
import com.distributed.scheduler.repository.TaskInstanceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class PreemptionService {

    private final TaskInstanceRepository taskInstanceRepository;
    private final TaskDefinitionRepository taskDefinitionRepository;
    private final ExecutorService executorService;
    private final TaskService taskService;
    private final StringRedisTemplate redisTemplate;

    @Value("${scheduler.task.preemption-enabled:true}")
    private boolean preemptionEnabled;

    @Value("${scheduler.task.preemption-priority-gap:3}")
    private int preemptionPriorityGap;

    @Value("${scheduler.task.suspend-signal-prefix:task:suspend:}")
    private String suspendSignalPrefix;

    @Transactional
    public boolean checkAndPreempt(TaskInstance highPriorityTask) {
        if (!preemptionEnabled) {
            log.debug("Preemption is disabled");
            return false;
        }

        TaskDefinition highPriorityTaskDef = taskDefinitionRepository.findById(highPriorityTask.getTaskId())
                .orElseThrow(() -> new RuntimeException("Task definition not found"));

        int highPriority = highPriorityTaskDef.getPriority();
        String taskType = highPriorityTaskDef.getTaskType();

        List<ExecutorRegistry> executors = executorService.getActiveExecutors();
        for (ExecutorRegistry executor : executors) {
            if (executor.getTaskTypes() == null || !executor.getTaskTypes().contains(taskType)) {
                continue;
            }

            Optional<TaskInstance> lowestPriorityRunning = findLowestPriorityRunningTask(
                executor.getId(), highPriority);
            
            if (lowestPriorityRunning.isPresent()) {
                TaskInstance lowPriorityTask = lowestPriorityRunning.get();
                TaskDefinition lowPriorityTaskDef = taskDefinitionRepository.findById(lowPriorityTask.getTaskId())
                        .orElse(null);
                
                if (lowPriorityTaskDef == null || !Boolean.TRUE.equals(lowPriorityTaskDef.getPreemptible())) {
                    continue;
                }

                int priorityGap = highPriority - lowPriorityTaskDef.getPriority();
                if (priorityGap >= preemptionPriorityGap) {
                    return preemptTask(highPriorityTask, lowPriorityTask, executor.getId());
                }
            }
        }

        return false;
    }

    private Optional<TaskInstance> findLowestPriorityRunningTask(String executorId, int highPriority) {
        List<TaskInstance> runningTasks = taskInstanceRepository.findRunningInstancesByExecutor(executorId);
        
        return runningTasks.stream()
                .filter(task -> {
                    TaskDefinition taskDef = taskDefinitionRepository.findById(task.getTaskId()).orElse(null);
                    return taskDef != null && taskDef.getPriority() < highPriority;
                })
                .min(Comparator.comparingInt(task -> {
                    TaskDefinition taskDef = taskDefinitionRepository.findById(task.getTaskId()).orElse(null);
                    return taskDef != null ? taskDef.getPriority() : Integer.MAX_VALUE;
                }));
    }

    @Transactional
    public boolean preemptTask(TaskInstance highPriorityTask, TaskInstance lowPriorityTask, String executorId) {
        log.info("Preempting task {} (priority {}) for higher priority task {} (priority {}) on executor {}",
            lowPriorityTask.getId(),
            taskDefinitionRepository.findById(lowPriorityTask.getTaskId())
                .map(TaskDefinition::getPriority).orElse(-1),
            highPriorityTask.getId(),
            taskDefinitionRepository.findById(highPriorityTask.getTaskId())
                .map(TaskDefinition::getPriority).orElse(-1),
            executorId);

        sendSuspendSignal(executorId, lowPriorityTask.getId());

        lowPriorityTask.setStatus(TaskStatus.SUSPENDED.name());
        lowPriorityTask.setSuspendedByInstanceId(highPriorityTask.getId());
        lowPriorityTask.setSuspendedAt(LocalDateTime.now());
        taskInstanceRepository.save(lowPriorityTask);

        highPriorityTask.setExecutorId(executorId);
        highPriorityTask.setStatus(TaskStatus.RUNNING.name());
        highPriorityTask.setStartedAt(LocalDateTime.now());
        taskInstanceRepository.save(highPriorityTask);

        log.info("Task {} suspended, task {} started on executor {}",
            lowPriorityTask.getId(), highPriorityTask.getId(), executorId);

        return true;
    }

    private void sendSuspendSignal(String executorId, Long taskInstanceId) {
        String signalKey = suspendSignalPrefix + executorId;
        redisTemplate.opsForList().leftPush(signalKey, String.valueOf(taskInstanceId));
        log.debug("Sent suspend signal for task {} to executor {}", taskInstanceId, executorId);
    }

    @Transactional
    public boolean resumeTask(Long taskInstanceId) {
        TaskInstance instance = taskInstanceRepository.findById(taskInstanceId)
                .orElseThrow(() -> new RuntimeException("Task instance not found: " + taskInstanceId));

        if (!TaskStatus.SUSPENDED.name().equals(instance.getStatus())) {
            log.warn("Cannot resume task {}: status is {}, expected SUSPENDED", 
                taskInstanceId, instance.getStatus());
            return false;
        }

        TaskDefinition taskDef = taskDefinitionRepository.findById(instance.getTaskId())
                .orElseThrow(() -> new RuntimeException("Task definition not found"));

        instance.setStatus(TaskStatus.PENDING.name());
        instance.setExecutorId(null);
        instance.setResumeCount(instance.getResumeCount() + 1);
        instance.setStartedAt(null);
        instance.setTimeoutAt(null);
        taskInstanceRepository.save(instance);

        log.info("Task {} resumed, attempt {}", taskInstanceId, instance.getResumeCount());
        return true;
    }

    @Transactional
    public void handleSuspendedTaskCompletion(Long suspendedTaskId, String checkpointData) {
        TaskInstance instance = taskInstanceRepository.findById(suspendedTaskId)
                .orElseThrow(() -> new RuntimeException("Task instance not found: " + suspendedTaskId));

        if (checkpointData != null && !checkpointData.isEmpty()) {
            instance.setCheckpointData(checkpointData);
            taskInstanceRepository.save(instance);
            log.info("Saved checkpoint data for suspended task {}", suspendedTaskId);
        }
    }

    public boolean shouldPreempt(int highPriority, int lowPriority) {
        return preemptionEnabled && (highPriority - lowPriority) >= preemptionPriorityGap;
    }

    public List<TaskInstance> getSuspendedTasks() {
        return taskInstanceRepository.findByStatus(TaskStatus.SUSPENDED.name());
    }

    public Set<String> getSuspendSignals(String executorId) {
        String signalKey = suspendSignalPrefix + executorId;
        return redisTemplate.opsForSet().members(signalKey);
    }

    public String consumeSuspendSignal(String executorId) {
        String signalKey = suspendSignalPrefix + executorId;
        return redisTemplate.opsForList().rightPop(signalKey);
    }
}
