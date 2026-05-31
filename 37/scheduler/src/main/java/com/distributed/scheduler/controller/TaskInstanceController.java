package com.distributed.scheduler.controller;

import com.distributed.scheduler.common.TaskStatus;
import com.distributed.scheduler.dto.TaskResultDTO;
import com.distributed.scheduler.entity.TaskInstance;
import com.distributed.scheduler.service.DagService;
import com.distributed.scheduler.service.PreemptionService;
import com.distributed.scheduler.service.TaskDispatchService;
import com.distributed.scheduler.service.TaskService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/task-instances")
@RequiredArgsConstructor
public class TaskInstanceController {

    private final TaskService taskService;
    private final TaskDispatchService taskDispatchService;
    private final DagService dagService;
    private final PreemptionService preemptionService;

    @GetMapping("/{instanceId}")
    public ResponseEntity<TaskInstance> getTaskInstance(@PathVariable Long instanceId) {
        return taskService.getTaskInstance(instanceId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping
    public ResponseEntity<List<TaskInstance>> getTaskInstances(
            @RequestParam(required = false) TaskStatus status,
            @RequestParam(required = false) String traceId) {
        if (traceId != null) {
            return ResponseEntity.ok(taskService.getTaskInstancesByTraceId(traceId));
        }
        if (status != null) {
            return ResponseEntity.ok(taskService.getTaskInstancesByStatus(status));
        }
        return ResponseEntity.ok(List.of());
    }

    @PostMapping("/{instanceId}/cancel")
    public ResponseEntity<Map<String, Object>> cancelTaskInstance(@PathVariable Long instanceId) {
        boolean cancelled = taskService.cancelTaskInstance(instanceId);
        Map<String, Object> response = new HashMap<>();
        response.put("cancelled", cancelled);
        response.put("message", cancelled ? "Task cancelled successfully" : "Task cannot be cancelled");
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{instanceId}/retry")
    public ResponseEntity<Map<String, Object>> retryTaskInstance(@PathVariable Long instanceId) {
        boolean retried = taskDispatchService.retryTask(instanceId);
        Map<String, Object> response = new HashMap<>();
        response.put("retried", retried);
        response.put("message", retried ? "Task retried successfully" : "Task cannot be retried (max retries reached)");
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{instanceId}/suspend")
    public ResponseEntity<Map<String, Object>> suspendTaskInstance(
            @PathVariable Long instanceId,
            @RequestBody(required = false) Map<String, String> body) {
        String checkpointData = body != null ? body.get("checkpointData") : null;
        boolean suspended = taskDispatchService.suspendTask(instanceId, checkpointData);
        Map<String, Object> response = new HashMap<>();
        response.put("suspended", suspended);
        response.put("message", suspended ? "Task suspended successfully" : "Task cannot be suspended");
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{instanceId}/resume")
    public ResponseEntity<Map<String, Object>> resumeTaskInstance(@PathVariable Long instanceId) {
        boolean resumed = taskDispatchService.resumeTask(instanceId);
        Map<String, Object> response = new HashMap<>();
        response.put("resumed", resumed);
        response.put("message", resumed ? "Task resumed successfully" : "Task cannot be resumed (not suspended)");
        return ResponseEntity.ok(response);
    }

    @GetMapping("/suspended")
    public ResponseEntity<List<TaskInstance>> getSuspendedTasks() {
        return ResponseEntity.ok(taskDispatchService.getSuspendedTasks());
    }

    @GetMapping("/executor/{executorId}/suspend-signals")
    public ResponseEntity<String> getSuspendSignal(@PathVariable String executorId) {
        String signal = preemptionService.consumeSuspendSignal(executorId);
        if (signal != null) {
            return ResponseEntity.ok(signal);
        }
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/result")
    public ResponseEntity<Map<String, String>> handleTaskResult(@RequestBody TaskResultDTO dto) {
        TaskStatus status = TaskStatus.valueOf(dto.getStatus());
        taskDispatchService.handleTaskResult(
            dto.getTaskInstanceId(), 
            status, 
            dto.getResult(), 
            dto.getErrorMessage()
        );
        
        if (status == TaskStatus.SUCCESS) {
            dagService.onTaskCompleted(dto.getTaskInstanceId());
        }
        
        Map<String, String> response = new HashMap<>();
        response.put("message", "Result received successfully");
        return ResponseEntity.ok(response);
    }

    @GetMapping("/trace/{traceId}")
    public ResponseEntity<List<TaskInstance>> getTaskInstancesByTraceId(@PathVariable String traceId) {
        return ResponseEntity.ok(taskService.getTaskInstancesByTraceId(traceId));
    }
}
