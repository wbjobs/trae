package com.distributed.scheduler.service;

import com.distributed.scheduler.dto.DagValidationResult;
import com.distributed.scheduler.entity.DagEdge;
import com.distributed.scheduler.entity.TaskDefinition;
import com.distributed.scheduler.exception.DagCycleException;
import com.distributed.scheduler.repository.DagEdgeRepository;
import com.distributed.scheduler.repository.TaskDefinitionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class DagValidationService {

    private final DagEdgeRepository dagEdgeRepository;
    private final TaskDefinitionRepository taskDefinitionRepository;

    public DagValidationResult validateDag(Long dagId) {
        List<DagEdge> edges = dagEdgeRepository.findByDagId(dagId);
        return validateEdges(edges);
    }

    public DagValidationResult validateEdges(List<DagEdge> edges) {
        if (edges == null || edges.isEmpty()) {
            return DagValidationResult.valid(Collections.emptyList());
        }

        Map<Long, List<Long>> adjacencyList = new HashMap<>();
        Map<Long, Integer> inDegree = new HashMap<>();
        Set<Long> allNodes = new HashSet<>();

        for (DagEdge edge : edges) {
            Long from = edge.getFromTaskId();
            Long to = edge.getToTaskId();

            adjacencyList.computeIfAbsent(from, k -> new ArrayList<>()).add(to);
            inDegree.merge(to, 1, Integer::sum);
            inDegree.putIfAbsent(from, 0);

            allNodes.add(from);
            allNodes.add(to);
        }

        for (Long node : allNodes) {
            inDegree.putIfAbsent(node, 0);
            adjacencyList.putIfAbsent(node, new ArrayList<>());
        }

        return kahnTopologicalSort(adjacencyList, inDegree, allNodes);
    }

    private DagValidationResult kahnTopologicalSort(
            Map<Long, List<Long>> adjacencyList,
            Map<Long, Integer> inDegree,
            Set<Long> allNodes) {

        Queue<Long> queue = new LinkedList<>();
        List<Long> topoOrder = new ArrayList<>();

        for (Map.Entry<Long, Integer> entry : inDegree.entrySet()) {
            if (entry.getValue() == 0) {
                queue.offer(entry.getKey());
            }
        }

        int processedCount = 0;

        while (!queue.isEmpty()) {
            Long current = queue.poll();
            topoOrder.add(current);
            processedCount++;

            for (Long neighbor : adjacencyList.getOrDefault(current, Collections.emptyList())) {
                int newDegree = inDegree.merge(neighbor, -1, Integer::sum);
                if (newDegree == 0) {
                    queue.offer(neighbor);
                }
            }
        }

        if (processedCount == allNodes.size()) {
            log.debug("DAG validation passed, topological order: {}", topoOrder);
            return DagValidationResult.valid(topoOrder);
        } else {
            List<String> cyclePath = findCyclePath(adjacencyList, inDegree, allNodes);
            String message = String.format("DAG contains a cycle: %s", 
                cyclePath.stream().collect(Collectors.joining(" -> ")));
            log.warn(message);
            return DagValidationResult.invalid(cyclePath, message);
        }
    }

    private List<String> findCyclePath(
            Map<Long, List<Long>> adjacencyList,
            Map<Long, Integer> inDegree,
            Set<Long> allNodes) {

        Set<Long> remainingNodes = new HashSet<>();
        for (Long node : allNodes) {
            if (inDegree.getOrDefault(node, 0) > 0) {
                remainingNodes.add(node);
            }
        }

        for (Long startNode : remainingNodes) {
            List<String> cycle = dfsFindCycle(startNode, adjacencyList, new HashSet<>(), new ArrayList<>());
            if (cycle != null) {
                return cycle;
            }
        }

        List<Long> remainingList = new ArrayList<>(remainingNodes);
        return remainingList.stream()
                .map(this::getTaskName)
                .collect(Collectors.toList());
    }

    private List<String> dfsFindCycle(
            Long current,
            Map<Long, List<Long>> adjacencyList,
            Set<Long> visited,
            List<Long> path) {

        visited.add(current);
        path.add(current);

        for (Long neighbor : adjacencyList.getOrDefault(current, Collections.emptyList())) {
            if (!visited.contains(neighbor)) {
                List<String> result = dfsFindCycle(neighbor, adjacencyList, visited, path);
                if (result != null) {
                    return result;
                }
            } else if (path.contains(neighbor)) {
                int cycleStart = path.indexOf(neighbor);
                List<Long> cycle = path.subList(cycleStart, path.size());
                List<String> cycleWithNames = cycle.stream()
                        .map(this::getTaskName)
                        .collect(Collectors.toList());
                cycleWithNames.add(getTaskName(neighbor));
                return cycleWithNames;
            }
        }

        path.remove(path.size() - 1);
        return null;
    }

    private String getTaskName(Long taskId) {
        if (taskId == null) {
            return "null";
        }
        return taskDefinitionRepository.findById(taskId)
                .map(TaskDefinition::getTaskName)
                .orElse("Task-" + taskId);
    }

    public void validateDagOrThrow(Long dagId) {
        DagValidationResult result = validateDag(dagId);
        if (!result.isValid()) {
            throw new DagCycleException(result.getMessage(), result.getCyclePath());
        }
    }

    public List<String> getTaskNames(List<Long> taskIds) {
        return taskIds.stream()
                .map(this::getTaskName)
                .collect(Collectors.toList());
    }
}
