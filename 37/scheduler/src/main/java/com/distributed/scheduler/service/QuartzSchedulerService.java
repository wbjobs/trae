package com.distributed.scheduler.service;

import com.distributed.scheduler.entity.TaskDefinition;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.quartz.*;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class QuartzSchedulerService {

    private final Scheduler scheduler;

    public void scheduleCronTask(TaskDefinition task) throws SchedulerException {
        if (task.getCronExpression() == null || task.getCronExpression().isEmpty()) {
            throw new RuntimeException("Task does not have a cron expression: " + task.getTaskName());
        }

        JobKey jobKey = JobKey.jobKey("cron-" + task.getId(), "cron-tasks");
        TriggerKey triggerKey = TriggerKey.triggerKey("cron-" + task.getId(), "cron-triggers");

        if (scheduler.checkExists(jobKey)) {
            scheduler.deleteJob(jobKey);
        }

        JobDataMap jobDataMap = new JobDataMap();
        jobDataMap.put("taskId", task.getId());
        jobDataMap.put("taskName", task.getTaskName());

        JobDetail jobDetail = JobBuilder.newJob(CronTaskJob.class)
                .withIdentity(jobKey)
                .usingJobData(jobDataMap)
                .storeDurably()
                .build();

        CronTrigger trigger = TriggerBuilder.newTrigger()
                .withIdentity(triggerKey)
                .withSchedule(CronScheduleBuilder.cronSchedule(task.getCronExpression()))
                .build();

        scheduler.scheduleJob(jobDetail, trigger);
        log.info("Scheduled cron task: {} with expression: {}", task.getTaskName(), task.getCronExpression());
    }

    public void unscheduleCronTask(Long taskId) throws SchedulerException {
        JobKey jobKey = JobKey.jobKey("cron-" + taskId, "cron-tasks");
        
        if (scheduler.checkExists(jobKey)) {
            scheduler.deleteJob(jobKey);
            log.info("Unscheduled cron task: {}", taskId);
        }
    }

    public void pauseCronTask(Long taskId) throws SchedulerException {
        JobKey jobKey = JobKey.jobKey("cron-" + taskId, "cron-tasks");
        
        if (scheduler.checkExists(jobKey)) {
            scheduler.pauseJob(jobKey);
            log.info("Paused cron task: {}", taskId);
        }
    }

    public void resumeCronTask(Long taskId) throws SchedulerException {
        JobKey jobKey = JobKey.jobKey("cron-" + taskId, "cron-tasks");
        
        if (scheduler.checkExists(jobKey)) {
            scheduler.resumeJob(jobKey);
            log.info("Resumed cron task: {}", taskId);
        }
    }
}
