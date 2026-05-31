package com.config.drift.model;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;
import java.util.Map;

@Data
@Document(collection = "config_snapshots")
@CompoundIndex(def = "{'serviceName': 1, 'snapshotTime': -1}")
public class ConfigSnapshot {

    @Id
    private String id;

    private String serviceName;

    private String gitUrl;

    private String branch;

    private String commitId;

    private String configPath;

    private Map<String, Object> configData;

    private String configVersion;

    private LocalDateTime snapshotTime;

    private boolean isBaseline;

    private String baselineCommitId;
}
