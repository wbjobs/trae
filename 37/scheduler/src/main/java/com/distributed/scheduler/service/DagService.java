package com.distributed.scheduler.service;

import com.distributed.scheduler.common.TaskStatus;
import com.distributed.scheduler.dto.DagDefinitionDTO;
import com.distributed.scheduler.dto.DagEdgeDTO;
import com.distributed.scheduler.dto.DagValidationResult;
import com.distributed.scheduler.entity.DagDefinition;
import com.distributed.scheduler.entity.DagEdge;
import com.distributed.scheduler.entity.TaskDefinition;
import com.distributed.scheduler.entity.TaskInstance;
import com.distributed.scheduler.exception.DagCycleException;
import com.distributed.scheduler.repository.DagDefinitionRepository;
import com.distributed.scheduler.repository.DagEdgeRepository;
import com.distributed.scheduler.repository.TaskDefinitionRepository;
import com.distributed.scheduler.repository.TaskInstanceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class DagService {

    private final DagDefinitionRepository dagDefinitionRepository;
    private final DagEdgeRepository dagEdgeRepository;
    private final TaskDefinitionRepository taskDefinitionRepository;
    private final TaskInstanceRepository taskInstanceRepository;
    private final TaskService taskService;
    private final DagValidationService dagValidationService;

    @Transactional
    public DagDefinition createDag(DagDefinitionDTO dto) {
        if (dagDefinitionRepository.existsByDagName(dto.getDagName())) {
            throw new RuntimeException("DAG name already exists: " + dto.getDagName());
        }

        DagDefinition dag = new DagDefinition();
        dag.setDagName(dto.getDagName());
        dag.setDescription(dto.getDescription());
        dag = dagDefinitionRepository.save(dag);

        if (dto.getEdges() != null && !dto.getEdges().isEmpty()) {
            validateAndCreateEdges(dag.getId(), dto.getEdges());
        }

        return dag;
    }

    @Transactional
    public void addEdges(Long dagId, List<DagEdgeDTO> edges) {
        validateAndCreateEdges(dagId, edges);
    }

    private void validateAndCreateEdges(Long dagId, List<DagEdgeDTO> edges) {
        List<DagEdge> existingEdges = dagEdgeRepository.findByDagId(dagId);
        Map<String, Long> taskNameToId = new HashMap<>();
        List<DagEdge> allEdges = new ArrayList<>(existingEdges);

        for (DagEdgeDTO edgeDTO : edges) {
            Long fromTaskId = taskNameToId.computeIfAbsent(edgeDTO.getFromTaskName(), 
                name -> taskDefinitionRepository.findByTaskName(name)
                    .orElseThrow(() -> new RuntimeException("Task not found: " + name)).getId());
            
            Long toTaskId = taskNameToId.computeIfAbsent(edgeDTO.getToTaskName(),
                name -> taskDefinitionRepository.findByTaskName(name)
                    .orElseThrow(() -> new RuntimeException("Task not found: " + name)).getId());

            if (fromTaskId.equals(toTaskId)) {
                throw new DagCycleException(
                    "Self-loop detected: task '" + edgeDTO.getFromTaskName() + "' cannot depend on itself",
                    Arrays.asList(edgeDTO.getFromTaskName(), edgeDTO.getToTaskName())
                );
            }

            boolean exists = existingEdges.stream()
                .anyMatch(e -> e.getFromTaskId().equals(fromTaskId) && e.getToTaskId().equals(toTaskId));
            
            if (!exists) {
                DagEdge edge = new DagEdge();
                edge.setDagId(dagId);
                edge.setFromTaskId(fromTaskId);
                edge.setToTaskId(toTaskId);
                edge = dagEdgeRepository.save(edge);
                allEdges.add(edge);
            }
        }

        DagValidationResult validationResult = dagValidationService.validateEdges(allEdges);
        if (!validationResult.isValid()) {
            throw new DagCycleException(
                validationResult.getMessage(),
                validationResult.getCyclePath()
            );
        }

        log.info("DAG {} validation passed, topological order: {}", 
            dagId, dagValidationService.getTaskNames(validationResult.getTopologicalOrder()));
    }

    @Transactional
    public void deleteDag(Long dagId) {
        dagEdgeRepository.deleteByDagId(dagId);
        dagDefinitionRepository.deleteById(dagId);
    }

    public Optional<DagDefinition> getDagById(Long dagId) {
        return dagDefinitionRepository.findById(dagId);
    }

    public Optional<DagDefinition> getDagByName(String dagName) {
        return dagDefinitionRepository.findByDagName(dagName);
    }

    public List<DagDefinition> getAllDags() {
        return dagDefinitionRepository.findAll();
    }

    public List<DagEdge> getDagEdges(Long dagId) {
        return dagEdgeRepository.findByDagId(dagId);
    }

    @Transactional
    public List<TaskInstance> submitDag(String dagName, Map<String, Object> params) {
        DagDefinition dag = dagDefinitionRepository.findByDagName(dagName)
                .orElseThrow(() -> new RuntimeException("DAG not found: " + dagName));

        if (!"ACTIVE".equals(dag.getStatus())) {
            throw new RuntimeException("DAG is not active: " + dagName);
        }

        DagValidationResult validationResult = dagValidationService.validateDag(dag.getId());
        if (!validationResult.isValid()) {
            throw new DagCycleException(
                "Cannot submit DAG: " + validationResult.getMessage(),
                validationResult.getCyclePath(),
                dagName
            );
        }

        log.info("Submitting DAG '{}' with topological order: {}", 
            dagName, dagValidationService.getTaskNames(validationResult.getTopologicalOrder()));

        List<DagEdge> edges = dagEdgeRepository.findByDagId(dag.getId());
        
        Set<Long> allTaskIds = new HashSet<>();
        for (DagEdge edge : edges) {
            allTaskIds.add(edge.getFromTaskId());
            allTaskIds.add(edge.getToTaskId());
        }

        String traceId = UUID.randomUUID().toString();
        List<TaskInstance> instances = new ArrayList<>();

        for (Long taskId : allTaskIds) {
            TaskInstance instance = taskService.createTaskInstance(taskId, dag.getId(), params);
            instance.setTraceId(traceId);
            instance.setStatus(TaskStatus.SCHEDULED.name());
            instances.add(taskInstanceRepository.save(instance));
        }

        scheduleReadyTasks(dag.getId(), traceId);

        return instances;
    }

    @Transactional
    public void scheduleReadyTasks(Long dagId, String traceId) {
        List<DagEdge> edges = dagEdgeRepository.findByDagId(dagId);
        List<TaskInstance> instances = taskInstanceRepository.findByTraceId(traceId);

        Map<Long, TaskInstance> instanceMap = instances.stream()
                .collect(Collectors.toMap(TaskInstance::getTaskId, i -> i));

        Set<Long> completedTaskIds = instances.stream()
                .filter(i -> TaskStatus.SUCCESS.name().equals(i.getStatus()))
                .map(TaskInstance::getTaskId)
                .collect(Collectors.toSet());

        for (TaskInstance instance : instances) {
            if (!TaskStatus.PENDING.name().equals(instance.getStatus()) && 
                !TaskStatus.SCHEDULED.name().equals(instance.getStatus())) {
                continue;
            }

            List<DagEdge> incomingEdges = edges.stream()
                    .filter(e -> e.getToTaskId().equals(instance.getTaskId()))
                    .toList();

            boolean allDependenciesMet = incomingEdges.stream()
                    .allMatch(e -> completedTaskIds.contains(e.getFromTaskId()));

            if (allDependenciesMet && TaskStatus.SCHEDULED.name().equals(instance.getStatus())) {
                instance.setStatus(TaskStatus.PENDING.name());
                taskInstanceRepository.save(instance);
            }
        }
    }

    @Transactional
    public void onTaskCompleted(Long taskInstanceId) {
        TaskInstance instance = taskInstanceRepository.findById(taskInstanceId)
                .orElseThrow(() -> new RuntimeException("Task instance not found: " + taskInstanceId));

        if (instance.getDagId() != null && TaskStatus.SUCCESS.name().equals(instance.getStatus())) {
            scheduleReadyTasks(instance.getDagId(), instance.getTraceId());
        }
    }

    public List<TaskInstance> getDagInstances(Long dagId) {
        return taskInstanceRepository.findByDagId(dagId);
    }

    public DagValidationResult validateDag(Long dagId) {
        return dagValidationService.validateDag(dagId);
    }
}
