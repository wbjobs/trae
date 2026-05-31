package com.distributed.scheduler.controller;

import com.distributed.scheduler.dto.DagDefinitionDTO;
import com.distributed.scheduler.entity.DagDefinition;
import com.distributed.scheduler.entity.DagEdge;
import com.distributed.scheduler.entity.TaskInstance;
import com.distributed.scheduler.service.DagService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/dags")
@RequiredArgsConstructor
public class DagController {

    private final DagService dagService;

    @PostMapping
    public ResponseEntity<DagDefinition> createDag(@RequestBody DagDefinitionDTO dto) {
        DagDefinition dag = dagService.createDag(dto);
        return ResponseEntity.ok(dag);
    }

    @GetMapping("/{dagId}")
    public ResponseEntity<DagDefinition> getDagById(@PathVariable Long dagId) {
        return dagService.getDagById(dagId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/name/{dagName}")
    public ResponseEntity<DagDefinition> getDagByName(@PathVariable String dagName) {
        return dagService.getDagByName(dagName)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping
    public ResponseEntity<List<DagDefinition>> getAllDags() {
        return ResponseEntity.ok(dagService.getAllDags());
    }

    @GetMapping("/{dagId}/edges")
    public ResponseEntity<List<DagEdge>> getDagEdges(@PathVariable Long dagId) {
        return ResponseEntity.ok(dagService.getDagEdges(dagId));
    }

    @PostMapping("/{dagId}/edges")
    public ResponseEntity<Map<String, String>> addEdges(
            @PathVariable Long dagId, 
            @RequestBody DagDefinitionDTO dto) {
        dagService.addEdges(dagId, dto.getEdges());
        Map<String, String> response = new HashMap<>();
        response.put("message", "Edges added successfully");
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{dagId}")
    public ResponseEntity<Map<String, String>> deleteDag(@PathVariable Long dagId) {
        dagService.deleteDag(dagId);
        Map<String, String> response = new HashMap<>();
        response.put("message", "DAG deleted successfully");
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{dagName}/submit")
    public ResponseEntity<List<TaskInstance>> submitDag(
            @PathVariable String dagName,
            @RequestBody(required = false) Map<String, Object> params) {
        List<TaskInstance> instances = dagService.submitDag(dagName, params);
        return ResponseEntity.ok(instances);
    }

    @GetMapping("/{dagId}/instances")
    public ResponseEntity<List<TaskInstance>> getDagInstances(@PathVariable Long dagId) {
        return ResponseEntity.ok(dagService.getDagInstances(dagId));
    }

    @GetMapping("/{dagId}/validate")
    public ResponseEntity<?> validateDag(@PathVariable Long dagId) {
        return ResponseEntity.ok(dagService.validateDag(dagId));
    }
}
