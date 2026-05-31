package com.distributed.scheduler.service;

import com.distributed.scheduler.common.TaskStatus;
import com.distributed.scheduler.entity.ExecutorRegistry;
import com.distributed.scheduler.entity.TaskInstance;
import com.distributed.scheduler.repository.TaskInstanceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class FailoverService {

    private final ExecutorService executorService;
    private final TaskInstanceRepository taskInstanceRepository;
    private final TaskDispatchService taskDispatchService;
    private final TaskService taskService;

    @Value("${scheduler.task.heartbeat-timeout-seconds:30}")
    private int heartbeatTimeoutSeconds;

    @Scheduled(fixedDelayString = "${scheduler.task.failover-check-interval-seconds:60}000")
    @Transactional
    public void checkAndRecoverFailedExecutors() {
        List<ExecutorRegistry> expiredExecutors = executorService.getExpiredExecutors(heartbeatTimeoutSeconds);
        
        for (ExecutorRegistry executor : expiredExecutors) {
            log.warn("Detected expired executor: {}, last heartbeat: {}", 
                executor.getId(), executor.getLastHeartbeatAt());
            
            recoverExecutorTasks(executor.getId());
            executorService.markExecutorInactive(executor.getId());
        }
    }

    @Scheduled(fixedDelay = 60000)
    @Transactional
    public void checkTimeoutTasks() {
        List<TaskInstance> timeoutInstances = taskService.getTimeoutInstances();
        
        for (TaskInstance instance : timeoutInstances) {
            log.warn("Task instance {} timed out", instance.getId());
            handleTimeoutTask(instance);
        }
    }

    @Transactional
    public void recoverExecutorTasks(String executorId) {
        List<TaskInstance> affectedInstances = taskInstanceRepository.findInstancesByExecutor(executorId);
        
        for (TaskInstance instance : affectedInstances) {
            log.info("Recovering task instance: {}, current status: {}", instance.getId(), instance.getStatus());
            
            if (TaskStatus.RUNNING.name().equals(instance.getStatus())) {
                boolean retried = taskDispatchService.retryTask(instance.getId());
                if (!retried) {
                    taskService.updateTaskInstanceStatus(
                        instance.getId(), 
                        TaskStatus.FAILED, 
                        null, 
                        "Executor failed and max retries reached"
                    );
                }
            } else if (TaskStatus.PENDING.name().equals(instance.getStatus()) ||
                       TaskStatus.SCHEDULED.name().equals(instance.getStatus())) {
                instance.setExecutorId(null);
                taskInstanceRepository.save(instance);
            }
        }
        
        log.info("Recovered {} tasks from executor {}", affectedInstances.size(), executorId);
    }

    @Transactional
    public void handleTimeoutTask(TaskInstance instance) {
        taskService.updateTaskInstanceStatus(
            instance.getId(), 
            TaskStatus.TIMEOUT, 
            null, 
            "Task execution timed out"
        );
        
        boolean retried = taskDispatchService.retryTask(instance.getId());
        if (!retried) {
            log.warn("Task instance {} timed out and no more retries available", instance.getId());
        }
    }
}
