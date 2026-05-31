package com.distributed.scheduler.repository;

import com.distributed.scheduler.entity.DagEdge;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface DagEdgeRepository extends JpaRepository<DagEdge, Long> {
    List<DagEdge> findByDagId(Long dagId);
    
    @Query("SELECT de FROM DagEdge de WHERE de.dagId = :dagId AND de.toTaskId = :taskId")
    List<DagEdge> findIncomingEdges(Long dagId, Long taskId);
    
    @Query("SELECT de FROM DagEdge de WHERE de.dagId = :dagId AND de.fromTaskId = :taskId")
    List<DagEdge> findOutgoingEdges(Long dagId, Long taskId);
    
    void deleteByDagId(Long dagId);
}
