package com.distributed.scheduler.service;

import com.distributed.scheduler.dto.TaskSubmitDTO;
import com.distributed.scheduler.entity.TaskDefinition;
import com.distributed.scheduler.repository.TaskDefinitionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.quartz.Job;
import org.quartz.JobExecutionContext;
import org.quartz.JobExecutionException;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class CronTaskJob implements Job {

    private final TaskService taskService;
    private final TaskDefinitionRepository taskDefinitionRepository;

    @Override
    public void execute(JobExecutionContext context) throws JobExecutionException {
        Long taskId = context.getJobDetail().getJobDataMap().getLong("taskId");
        String taskName = context.getJobDetail().getJobDataMap().getString("taskName");

        try {
            TaskDefinition task = taskDefinitionRepository.findById(taskId)
                    .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));

            if (!"ACTIVE".equals(task.getStatus())) {
                log.info("Task {} is not active, skipping execution", taskName);
                return;
            }

            TaskSubmitDTO submitDTO = new TaskSubmitDTO();
            submitDTO.setTaskName(taskName);
            submitDTO.setParams(task.getTaskParams());

            taskService.submitTask(submitDTO, null);
            log.info("Cron task triggered: {}", taskName);
        } catch (Exception e) {
            log.error("Failed to execute cron job: {}", taskName, e);
            throw new JobExecutionException(e);
        }
    }
}
