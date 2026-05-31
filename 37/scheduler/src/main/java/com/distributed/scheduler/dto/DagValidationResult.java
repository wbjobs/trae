package com.distributed.scheduler.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DagValidationResult {

    private boolean valid;
    private List<Long> topologicalOrder;
    private List<String> cyclePath;
    private String message;

    public static DagValidationResult valid(List<Long> topologicalOrder) {
        return DagValidationResult.builder()
                .valid(true)
                .topologicalOrder(topologicalOrder)
                .build();
    }

    public static DagValidationResult invalid(List<String> cyclePath, String message) {
        return DagValidationResult.builder()
                .valid(false)
                .cyclePath(cyclePath)
                .message(message)
                .build();
    }
}
