package com.distributed.scheduler.dto;

import lombok.Data;

import java.util.List;

@Data
public class DagDefinitionDTO {
    private String dagName;
    private String description;
    private List<DagEdgeDTO> edges;
}
