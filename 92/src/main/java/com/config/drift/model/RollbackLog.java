package com.config.drift.model;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Document(collection = "rollback_logs")
@CompoundIndex(def = "{'serviceName': 1, 'rollbackTime': -1}")
public class RollbackLog {

    @Id
    private String id;

    private String detectionId;

    private String serviceName;

    private String fromCommitId;

    private String toCommitId;

    private RollbackStatus status;

    private List<DriftItem> rolledBackItems;

    private int rollbackCount;

    private String gitCommitId;

    private String errorMessage;

    private String triggeredBy;

    private LocalDateTime rollbackTime;

    public enum RollbackStatus {
        SUCCESS,
        PARTIAL_SUCCESS,
        FAILED,
        NO_DRIFT
    }
}
