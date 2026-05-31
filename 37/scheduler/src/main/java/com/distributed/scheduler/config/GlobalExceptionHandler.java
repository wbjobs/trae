package com.distributed.scheduler.config;

import com.distributed.scheduler.exception.DagCycleException;
import lombok.extern.slf4j.Slf4j;
import org.quartz.SchedulerException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(DagCycleException.class)
    public ResponseEntity<Map<String, Object>> handleDagCycleException(DagCycleException e) {
        log.error("DAG cycle detected: {}", e.getMessage());
        Map<String, Object> response = new HashMap<>();
        response.put("error", "DAG_CYCLE_DETECTED");
        response.put("message", e.getMessage());
        response.put("cyclePath", e.getCyclePath());
        if (e.getDagName() != null) {
            response.put("dagName", e.getDagName());
        }
        response.put("status", HttpStatus.BAD_REQUEST.value());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(response);
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<Map<String, Object>> handleRuntimeException(RuntimeException e) {
        log.error("Runtime exception: {}", e.getMessage(), e);
        Map<String, Object> response = new HashMap<>();
        response.put("error", e.getMessage());
        response.put("status", HttpStatus.BAD_REQUEST.value());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(response);
    }

    @ExceptionHandler(SchedulerException.class)
    public ResponseEntity<Map<String, Object>> handleSchedulerException(SchedulerException e) {
        log.error("Scheduler exception: {}", e.getMessage(), e);
        Map<String, Object> response = new HashMap<>();
        response.put("error", "Scheduler error: " + e.getMessage());
        response.put("status", HttpStatus.INTERNAL_SERVER_ERROR.value());
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(response);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleException(Exception e) {
        log.error("Unexpected exception: {}", e.getMessage(), e);
        Map<String, Object> response = new HashMap<>();
        response.put("error", "Internal server error");
        response.put("status", HttpStatus.INTERNAL_SERVER_ERROR.value());
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(response);
    }
}
