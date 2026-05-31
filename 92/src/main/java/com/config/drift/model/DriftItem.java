package com.config.drift.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DriftItem {

    private String key;

    private Object baselineValue;

    private Object currentValue;

    private DriftType driftType;

    public enum DriftType {
        ADDED,
        REMOVED,
        MODIFIED
    }
}
