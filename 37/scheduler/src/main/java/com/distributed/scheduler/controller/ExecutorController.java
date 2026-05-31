package com.distributed.scheduler.controller;

import com.distributed.scheduler.dto.ExecutorHeartbeatDTO;
import com.distributed.scheduler.entity.ExecutorRegistry;
import com.distributed.scheduler.service.ExecutorService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/executors")
@RequiredArgsConstructor
public class ExecutorController {

    private final ExecutorService executorService;
    private final RedisTemplate<String, Object> redisTemplate;

    @Value("${scheduler.task.queue-prefix:task:queue:}")
    private String queuePrefix;

    @PostMapping("/register")
    public ResponseEntity<ExecutorRegistry> registerExecutor(@RequestBody ExecutorHeartbeatDTO dto) {
        ExecutorRegistry executor = executorService.registerExecutor(dto);
        return ResponseEntity.ok(executor);
    }

    @PostMapping("/heartbeat")
    public ResponseEntity<Map<String, Object>> heartbeat(@RequestBody Map<String, String> request) {
        String executorId = request.get("executorId");
        executorService.heartbeat(executorId);
        
        String queueName = queuePrefix + executorId;
        String task = (String) redisTemplate.opsForList().rightPop(queueName, 0, TimeUnit.SECONDS);
        
        Map<String, Object> response = new HashMap<>();
        response.put("status", "ok");
        if (task != null) {
            response.put("task", task);
        }
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{executorId}")
    public ResponseEntity<ExecutorRegistry> getExecutor(@PathVariable String executorId) {
        return executorService.getExecutor(executorId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping
    public ResponseEntity<List<ExecutorRegistry>> getAllExecutors(
            @RequestParam(required = false) String status) {
        if ("ACTIVE".equals(status)) {
            return ResponseEntity.ok(executorService.getActiveExecutors());
        }
        return ResponseEntity.ok(executorService.getAllExecutors());
    }

    @PostMapping("/{executorId}/inactive")
    public ResponseEntity<Map<String, String>> markInactive(@PathVariable String executorId) {
        executorService.markExecutorInactive(executorId);
        Map<String, String> response = new HashMap<>();
        response.put("message", "Executor marked as inactive");
        return ResponseEntity.ok(response);
    }
}
