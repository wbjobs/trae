package com.power.sampling.scheduler.controller;

import com.alibaba.csp.sentinel.annotation.SentinelResource;
import com.alibaba.csp.sentinel.slots.block.BlockException;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.power.sampling.scheduler.service.EdgeNodeService;
import com.power.sampling.scheduler.service.ScheduleTaskService;
import com.power.sampling.common.entity.EdgeNode;
import com.power.sampling.common.result.Result;
import com.power.sampling.common.result.ResultCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.concurrent.CompletableFuture;

@Slf4j
@RestController
@RequestMapping("/scheduler")
public class SchedulerController {

    @Autowired
    private EdgeNodeService edgeNodeService;

    @Autowired
    private ScheduleTaskService scheduleTaskService;

    @GetMapping("/node/{id}")
    @SentinelResource(value = "scheduler-node-get", blockHandler = "getNodeByIdBlockHandler")
    public Result<EdgeNode> getNodeById(@PathVariable("id") Long id) {
        return Result.success(edgeNodeService.getById(id));
    }

    @GetMapping("/node/code/{nodeCode}")
    @SentinelResource(value = "scheduler-node-code", blockHandler = "getNodeByCodeBlockHandler")
    public Result<EdgeNode> getNodeByCode(@PathVariable("nodeCode") String nodeCode) {
        return Result.success(edgeNodeService.getByCode(nodeCode));
    }

    @GetMapping("/node/list/all")
    @SentinelResource(value = "scheduler-node-list-all", blockHandler = "getEdgeNodeListBlockHandler")
    public Result<List<EdgeNode>> getAllNodes() {
        return Result.success(edgeNodeService.getAllNodes());
    }

    @GetMapping("/node/list/available")
    @SentinelResource(value = "scheduler-node-list-available", blockHandler = "getEdgeNodeListBlockHandler")
    public Result<List<EdgeNode>> getAvailableNodes() {
        return Result.success(edgeNodeService.getAvailableNodes());
    }

    @GetMapping("/node/page")
    @SentinelResource(value = "scheduler-node-page", blockHandler = "getNodePageBlockHandler")
    public Result<IPage<EdgeNode>> getNodePage(
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize,
            @RequestParam(required = false) String dataCenter,
            @RequestParam(required = false) Integer status) {
        return Result.success(edgeNodeService.getNodePage(pageNum, pageSize, dataCenter, status));
    }

    @PostMapping("/node/add")
    @SentinelResource(value = "scheduler-node-add", blockHandler = "nodeOperationBlockHandler")
    public Result<Boolean> addNode(@RequestBody EdgeNode node) {
        return Result.success(edgeNodeService.addNode(node));
    }

    @PostMapping("/node/update")
    @SentinelResource(value = "scheduler-node-update", blockHandler = "nodeOperationBlockHandler")
    public Result<Boolean> updateNode(@RequestBody EdgeNode node) {
        return Result.success(edgeNodeService.updateNode(node));
    }

    @PostMapping("/node/delete/{id}")
    @SentinelResource(value = "scheduler-node-delete", blockHandler = "nodeDeleteBlockHandler")
    public Result<Boolean> deleteNode(@PathVariable("id") Long id) {
        return Result.success(edgeNodeService.deleteNode(id));
    }

    @PostMapping("/node/heartbeat/{nodeCode}")
    @SentinelResource(value = "scheduler-node-heartbeat", blockHandler = "nodeHeartbeatBlockHandler")
    public Result<Boolean> nodeHeartbeat(@PathVariable("nodeCode") String nodeCode) {
        return Result.success(edgeNodeService.nodeHeartbeat(nodeCode));
    }

    @PostMapping("/node/allocate")
    @SentinelResource(value = "scheduler-node-allocate", blockHandler = "allocateBlockHandler")
    public Result<EdgeNode> allocateEdgeNode() {
        return Result.success(edgeNodeService.allocateEdgeNode());
    }

    @PostMapping("/node/release/{nodeCode}")
    @SentinelResource(value = "scheduler-node-release", blockHandler = "nodeReleaseBlockHandler")
    public Result<Boolean> releaseEdgeNode(@PathVariable("nodeCode") String nodeCode) {
        return Result.success(edgeNodeService.releaseEdgeNode(nodeCode));
    }

    @PostMapping("/task/sampling")
    @SentinelResource(value = "scheduler-task-sampling", blockHandler = "scheduleSamplingTaskBlockHandler")
    public Result<Boolean> scheduleSamplingTask(@RequestParam Long edgeNodeId,
                                                @RequestBody List<Long> deviceIds) {
        return Result.success(edgeNodeService.scheduleSamplingTask(edgeNodeId, deviceIds));
    }

    @PostMapping("/task/trigger")
    @SentinelResource(value = "scheduler-task-trigger", blockHandler = "triggerSamplingBlockHandler")
    public Result<CompletableFuture<Boolean>> triggerSampling(@RequestBody List<Long> deviceIds) {
        return Result.success(scheduleTaskService.triggerSamplingForDevices(deviceIds));
    }

    public Result<EdgeNode> getNodeByIdBlockHandler(Long id, BlockException e) {
        log.warn("调度接口限流: id={}, {}", id, e.getMessage());
        return Result.fail(ResultCode.RATE_LIMIT);
    }

    public Result<EdgeNode> getNodeByCodeBlockHandler(String nodeCode, BlockException e) {
        log.warn("调度接口限流: nodeCode={}, {}", nodeCode, e.getMessage());
        return Result.fail(ResultCode.RATE_LIMIT);
    }

    public Result<List<EdgeNode>> getEdgeNodeListBlockHandler(BlockException e) {
        log.warn("调度接口限流: {}", e.getMessage());
        return Result.fail(ResultCode.RATE_LIMIT);
    }

    public Result<IPage<EdgeNode>> getNodePageBlockHandler(Integer pageNum, Integer pageSize, String dataCenter, Integer status, BlockException e) {
        log.warn("调度接口限流: {}", e.getMessage());
        return Result.fail(ResultCode.RATE_LIMIT);
    }

    public Result<Boolean> nodeOperationBlockHandler(EdgeNode node, BlockException e) {
        log.warn("调度接口限流: nodeCode={}, {}", node.getNodeCode(), e.getMessage());
        return Result.fail(ResultCode.RATE_LIMIT);
    }

    public Result<Boolean> nodeDeleteBlockHandler(Long id, BlockException e) {
        log.warn("调度接口限流: id={}, {}", id, e.getMessage());
        return Result.fail(ResultCode.RATE_LIMIT);
    }

    public Result<Boolean> nodeHeartbeatBlockHandler(String nodeCode, BlockException e) {
        log.warn("调度接口限流: nodeCode={}, {}", nodeCode, e.getMessage());
        return Result.fail(ResultCode.RATE_LIMIT);
    }

    public Result<EdgeNode> allocateBlockHandler(BlockException e) {
        log.warn("调度接口限流: {}", e.getMessage());
        return Result.fail(ResultCode.RATE_LIMIT);
    }

    public Result<Boolean> nodeReleaseBlockHandler(String nodeCode, BlockException e) {
        log.warn("调度接口限流: nodeCode={}, {}", nodeCode, e.getMessage());
        return Result.fail(ResultCode.RATE_LIMIT);
    }

    public Result<Boolean> scheduleSamplingTaskBlockHandler(Long edgeNodeId, List<Long> deviceIds, BlockException e) {
        log.warn("调度接口限流: edgeNodeId={}, deviceCount={}, {}", edgeNodeId, deviceIds.size(), e.getMessage());
        return Result.fail(ResultCode.RATE_LIMIT);
    }

    public Result<CompletableFuture<Boolean>> triggerSamplingBlockHandler(List<Long> deviceIds, BlockException e) {
        log.warn("调度接口限流: deviceCount={}, {}", deviceIds.size(), e.getMessage());
        return Result.fail(ResultCode.RATE_LIMIT);
    }
}
