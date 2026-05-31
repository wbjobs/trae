package com.distributed.scheduler.controller;

import com.distributed.scheduler.common.TaskStatus;
import com.distributed.scheduler.dto.TaskDefinitionDTO;
import com.distributed.scheduler.dto.TaskSubmitDTO;
import com.distributed.scheduler.entity.TaskDefinition;
import com.distributed.scheduler.entity.TaskInstance;
import com.distributed.scheduler.service.QuartzSchedulerService;
import com.distributed.scheduler.service.TaskService;
import lombok.RequiredArgsConstructor;
import org.quartz.SchedulerException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/tasks")
@RequiredArgsConstructor
public class TaskController {

    private final TaskService taskService;
    private final QuartzSchedulerService quartzSchedulerService;

    @PostMapping
    public ResponseEntity<TaskDefinition> createTask(@RequestBody TaskDefinitionDTO dto) throws SchedulerException {
        TaskDefinition task = taskService.createTask(dto);
        
        if (dto.getCronExpression() != null && !dto.getCronExpression().isEmpty()) {
            quartzSchedulerService.scheduleCronTask(task);
        }
        
        return ResponseEntity.ok(task);
    }

    @PutMapping("/{taskId}")
    public ResponseEntity<TaskDefinition> updateTask(
            @PathVariable Long taskId, 
            @RequestBody TaskDefinitionDTO dto) throws SchedulerException {
        TaskDefinition task = taskService.updateTask(taskId, dto);
        
        if (dto.getCronExpression() != null && !dto.getCronExpression().isEmpty()) {
            quartzSchedulerService.scheduleCronTask(task);
        } else {
            quartzSchedulerService.unscheduleCronTask(taskId);
        }
        
        return ResponseEntity.ok(task);
    }

    @DeleteMapping("/{taskId}")
    public ResponseEntity<Map<String, String>> deleteTask(@PathVariable Long taskId) throws SchedulerException {
        quartzSchedulerService.unscheduleCronTask(taskId);
        taskService.deleteTask(taskId);
        
        Map<String, String> response = new HashMap<>();
        response.put("message", "Task deleted successfully");
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{taskId}")
    public ResponseEntity<TaskDefinition> getTaskById(@PathVariable Long taskId) {
        return taskService.getTaskById(taskId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping
    public ResponseEntity<List<TaskDefinition>> getAllTasks() {
        return ResponseEntity.ok(taskService.getAllTasks());
    }

    @PostMapping("/submit")
    public ResponseEntity<TaskInstance> submitTask(@RequestBody TaskSubmitDTO dto) {
        TaskInstance instance = taskService.submitTask(dto, null);
        return ResponseEntity.ok(instance);
    }

    @GetMapping("/{taskId}/instances")
    public ResponseEntity<List<TaskInstance>> getTaskInstances(@PathVariable Long taskId) {
        return ResponseEntity.ok(taskService.getTaskInstancesByTaskId(taskId));
    }

    @PostMapping("/{taskId}/pause")
    public ResponseEntity<Map<String, String>> pauseTask(@PathVariable Long taskId) throws SchedulerException {
        quartzSchedulerService.pauseCronTask(taskId);
        Map<String, String> response = new HashMap<>();
        response.put("message", "Task paused successfully");
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{taskId}/resume")
    public ResponseEntity<Map<String, String>> resumeTask(@PathVariable Long taskId) throws SchedulerException {
        quartzSchedulerService.resumeCronTask(taskId);
        Map<String, String> response = new HashMap<>();
        response.put("message", "Task resumed successfully");
        return ResponseEntity.ok(response);
    }
}
