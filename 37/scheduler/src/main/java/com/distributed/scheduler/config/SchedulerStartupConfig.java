package com.distributed.scheduler.config;

import com.distributed.scheduler.entity.TaskDefinition;
import com.distributed.scheduler.service.QuartzSchedulerService;
import com.distributed.scheduler.service.TaskService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class SchedulerStartupConfig implements ApplicationListener<ApplicationReadyEvent> {

    private final QuartzSchedulerService quartzSchedulerService;
    private final TaskService taskService;
    private final TaskDispatchService taskDispatchService;

    @Override
    public void onApplicationEvent(ApplicationReadyEvent event) {
        log.info("Starting up scheduler - loading existing cron tasks...");
        
        List<TaskDefinition> cronTasks = taskService.getActiveCronTasks();
        
        for (TaskDefinition task : cronTasks) {
            try {
                quartzSchedulerService.scheduleCronTask(task);
            } catch (Exception e) {
                log.error("Failed to schedule cron task: {}", task.getTaskName(), e);
            }
        }
        
        log.info("Scheduler startup completed, loaded {} cron tasks", cronTasks.size());
    }

    @Scheduled(fixedDelay = 5000)
    public void dispatchTasks() {
        try {
            taskDispatchService.dispatchPendingTasks();
        } catch (Exception e) {
            log.error("Error dispatching pending tasks", e);
        }
    }
}
