package com.distributed.scheduler.service;

import com.distributed.scheduler.common.TaskStatus;
import com.distributed.scheduler.dto.TaskDefinitionDTO;
import com.distributed.scheduler.dto.TaskSubmitDTO;
import com.distributed.scheduler.entity.TaskDefinition;
import com.distributed.scheduler.entity.TaskInstance;
import com.distributed.scheduler.repository.TaskDefinitionRepository;
import com.distributed.scheduler.repository.TaskInstanceRepository;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.Tracer;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class TaskService {

    private final TaskDefinitionRepository taskDefinitionRepository;
    private final TaskInstanceRepository taskInstanceRepository;
    private final Tracer tracer;

    @Transactional
    public TaskDefinition createTask(TaskDefinitionDTO dto) {
        if (taskDefinitionRepository.existsByTaskName(dto.getTaskName())) {
            throw new RuntimeException("Task name already exists: " + dto.getTaskName());
        }

        TaskDefinition task = new TaskDefinition();
        task.setTaskName(dto.getTaskName());
        task.setTaskType(dto.getTaskType());
        task.setCronExpression(dto.getCronExpression());
        task.setTaskParams(dto.getTaskParams());
        task.setDescription(dto.getDescription());
        if (dto.getMaxRetryTimes() != null) task.setMaxRetryTimes(dto.getMaxRetryTimes());
        if (dto.getRetryIntervalSeconds() != null) task.setRetryIntervalSeconds(dto.getRetryIntervalSeconds());
        if (dto.getTimeoutSeconds() != null) task.setTimeoutSeconds(dto.getTimeoutSeconds());
        if (dto.getPriority() != null) task.setPriority(dto.getPriority());
        if (dto.getPreemptible() != null) task.setPreemptible(dto.getPreemptible());

        return taskDefinitionRepository.save(task);
    }

    @Transactional
    public TaskDefinition updateTask(Long taskId, TaskDefinitionDTO dto) {
        TaskDefinition task = taskDefinitionRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));

        if (!task.getTaskName().equals(dto.getTaskName()) && 
            taskDefinitionRepository.existsByTaskName(dto.getTaskName())) {
            throw new RuntimeException("Task name already exists: " + dto.getTaskName());
        }

        task.setTaskName(dto.getTaskName());
        task.setTaskType(dto.getTaskType());
        task.setCronExpression(dto.getCronExpression());
        task.setTaskParams(dto.getTaskParams());
        task.setDescription(dto.getDescription());
        if (dto.getMaxRetryTimes() != null) task.setMaxRetryTimes(dto.getMaxRetryTimes());
        if (dto.getRetryIntervalSeconds() != null) task.setRetryIntervalSeconds(dto.getRetryIntervalSeconds());
        if (dto.getTimeoutSeconds() != null) task.setTimeoutSeconds(dto.getTimeoutSeconds());
        if (dto.getPriority() != null) task.setPriority(dto.getPriority());
        if (dto.getPreemptible() != null) task.setPreemptible(dto.getPreemptible());

        return taskDefinitionRepository.save(task);
    }

    @Transactional
    public void deleteTask(Long taskId) {
        taskDefinitionRepository.deleteById(taskId);
    }

    public Optional<TaskDefinition> getTaskById(Long taskId) {
        return taskDefinitionRepository.findById(taskId);
    }

    public Optional<TaskDefinition> getTaskByName(String taskName) {
        return taskDefinitionRepository.findByTaskName(taskName);
    }

    public List<TaskDefinition> getAllTasks() {
        return taskDefinitionRepository.findAll();
    }

    public List<TaskDefinition> getActiveCronTasks() {
        return taskDefinitionRepository.findByStatusAndCronExpressionIsNotNull("ACTIVE");
    }

    @Transactional
    public TaskInstance submitTask(TaskSubmitDTO dto, Long dagId) {
        Span span = tracer.spanBuilder("submitTask").startSpan();
        try {
            TaskDefinition task = taskDefinitionRepository.findByTaskName(dto.getTaskName())
                    .orElseThrow(() -> new RuntimeException("Task not found: " + dto.getTaskName()));

            if (!"ACTIVE".equals(task.getStatus())) {
                throw new RuntimeException("Task is not active: " + dto.getTaskName());
            }

            TaskInstance instance = new TaskInstance();
            instance.setTaskId(task.getId());
            instance.setDagId(dagId);
            instance.setStatus(TaskStatus.PENDING.name());
            instance.setTraceId(span.getSpanContext().getTraceId());
            instance.setParams(dto.getParams() != null ? dto.getParams() : task.getTaskParams());
            instance.setPriority(task.getPriority());
            instance.setScheduledAt(LocalDateTime.now());

            return taskInstanceRepository.save(instance);
        } finally {
            span.end();
        }
    }

    @Transactional
    public TaskInstance createTaskInstance(Long taskId, Long dagId, Map<String, Object> params) {
        TaskDefinition task = taskDefinitionRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));

        TaskInstance instance = new TaskInstance();
        instance.setTaskId(taskId);
        instance.setDagId(dagId);
        instance.setStatus(TaskStatus.PENDING.name());
        instance.setTraceId(UUID.randomUUID().toString());
        instance.setParams(params != null ? params : task.getTaskParams());
        instance.setPriority(task.getPriority());
        instance.setScheduledAt(LocalDateTime.now());

        return taskInstanceRepository.save(instance);
    }

    @Transactional
    public void updateTaskInstanceStatus(Long instanceId, TaskStatus status, String result, String errorMessage) {
        TaskInstance instance = taskInstanceRepository.findById(instanceId)
                .orElseThrow(() -> new RuntimeException("Task instance not found: " + instanceId));

        instance.setStatus(status.name());
        if (result != null) instance.setResult(result);
        if (errorMessage != null) instance.setErrorMessage(errorMessage);

        if (status == TaskStatus.RUNNING) {
            instance.setStartedAt(LocalDateTime.now());
        } else if (status == TaskStatus.SUCCESS || status == TaskStatus.FAILED || 
                   status == TaskStatus.CANCELLED || status == TaskStatus.TIMEOUT) {
            instance.setCompletedAt(LocalDateTime.now());
        }

        taskInstanceRepository.save(instance);
    }

    @Transactional
    public void assignExecutor(Long instanceId, String executorId) {
        TaskInstance instance = taskInstanceRepository.findById(instanceId)
                .orElseThrow(() -> new RuntimeException("Task instance not found: " + instanceId));

        TaskDefinition task = taskDefinitionRepository.findById(instance.getTaskId())
                .orElseThrow(() -> new RuntimeException("Task not found: " + instance.getTaskId()));

        instance.setExecutorId(executorId);
        instance.setStatus(TaskStatus.RUNNING.name());
        instance.setStartedAt(LocalDateTime.now());
        instance.setTimeoutAt(LocalDateTime.now().plusSeconds(task.getTimeoutSeconds()));

        taskInstanceRepository.save(instance);
    }

    public Optional<TaskInstance> getTaskInstance(Long instanceId) {
        return taskInstanceRepository.findById(instanceId);
    }

    public List<TaskInstance> getTaskInstancesByTaskId(Long taskId) {
        return taskInstanceRepository.findByTaskIdOrderByCreatedAtDesc(taskId);
    }

    public List<TaskInstance> getTaskInstancesByTraceId(String traceId) {
        return taskInstanceRepository.findByTraceId(traceId);
    }

    public List<TaskInstance> getTaskInstancesByStatus(TaskStatus status) {
        return taskInstanceRepository.findByStatus(status.name());
    }

    public List<TaskInstance> getPendingTasksOrderedByPriority() {
        return taskInstanceRepository.findByStatusOrderByPriorityDescCreatedAtAsc(TaskStatus.PENDING.name());
    }

    @Transactional
    public boolean cancelTaskInstance(Long instanceId) {
        TaskInstance instance = taskInstanceRepository.findById(instanceId)
                .orElseThrow(() -> new RuntimeException("Task instance not found: " + instanceId));

        if (TaskStatus.RUNNING.name().equals(instance.getStatus()) || 
            TaskStatus.PENDING.name().equals(instance.getStatus()) ||
            TaskStatus.SCHEDULED.name().equals(instance.getStatus())) {
            instance.setStatus(TaskStatus.CANCELLED.name());
            instance.setCompletedAt(LocalDateTime.now());
            taskInstanceRepository.save(instance);
            return true;
        }
        return false;
    }

    public List<TaskInstance> getTimeoutInstances() {
        return taskInstanceRepository.findTimeoutInstances(LocalDateTime.now());
    }
}
