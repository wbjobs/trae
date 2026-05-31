package com.distributed.scheduler.exception;

import lombok.Getter;

import java.util.List;

@Getter
public class DagCycleException extends RuntimeException {

    private final List<String> cyclePath;
    private final String dagName;

    public DagCycleException(String message, List<String> cyclePath, String dagName) {
        super(message);
        this.cyclePath = cyclePath;
        this.dagName = dagName;
    }

    public DagCycleException(String message, List<String> cyclePath) {
        this(message, cyclePath, null);
    }
}
