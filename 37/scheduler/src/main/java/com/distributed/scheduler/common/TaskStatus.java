package com.distributed.scheduler.common;

public enum TaskStatus {
    PENDING,
    SCHEDULED,
    RUNNING,
    SUCCESS,
    FAILED,
    CANCELLED,
    TIMEOUT,
    RETRYING,
    SUSPENDED
}
