package com.iot.monitor.enums;

import lombok.Getter;

@Getter
public enum AlarmLevel {

    P0("P0", 0, "紧急", "系统级故障，立即处理"),
    P1("P1", 1, "高危", "严重故障，1小时内处理"),
    P2("P2", 2, "中危", "一般故障，4小时内处理"),
    P3("P3", 3, "低危", "轻微异常，24小时内处理");

    private final String code;
    private final int priority;
    private final String name;
    private final String description;

    AlarmLevel(String code, int priority, String name, String description) {
        this.code = code;
        this.priority = priority;
        this.name = name;
        this.description = description;
    }

    public static AlarmLevel fromCode(String code) {
        if (code == null) {
            return P3;
        }
        for (AlarmLevel level : values()) {
            if (level.code.equalsIgnoreCase(code)) {
                return level;
            }
        }
        return P3;
    }

    public AlarmLevel escalate() {
        switch (this) {
            case P3:
                return P2;
            case P2:
                return P1;
            case P1:
                return P0;
            case P0:
                return P0;
            default:
                return this;
        }
    }

    public boolean isHigherOrEqual(AlarmLevel other) {
        return this.priority <= other.priority;
    }
}
