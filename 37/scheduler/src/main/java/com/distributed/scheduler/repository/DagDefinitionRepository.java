package com.distributed.scheduler.repository;

import com.distributed.scheduler.entity.DagDefinition;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface DagDefinitionRepository extends JpaRepository<DagDefinition, Long> {
    Optional<DagDefinition> findByDagName(String dagName);
    List<DagDefinition> findByStatus(String status);
    boolean existsByDagName(String dagName);
}
