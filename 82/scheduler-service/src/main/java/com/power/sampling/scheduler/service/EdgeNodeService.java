package com.power.sampling.scheduler.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.power.sampling.scheduler.mapper.EdgeNodeMapper;
import com.power.sampling.common.entity.Device;
import com.power.sampling.common.entity.EdgeNode;
import com.power.sampling.common.exception.BusinessException;
import com.power.sampling.common.feign.DeviceFeignClient;
import com.power.sampling.common.result.Result;
import com.power.sampling.common.result.ResultCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
public class EdgeNodeService {

    @Autowired
    private EdgeNodeMapper edgeNodeMapper;

    @Autowired
    private DeviceFeignClient deviceFeignClient;

    public EdgeNode getById(Long id) {
        return edgeNodeMapper.selectById(id);
    }

    public EdgeNode getByCode(String nodeCode) {
        return edgeNodeMapper.selectOne(new QueryWrapper<EdgeNode>()
                .eq("node_code", nodeCode));
    }

    public List<EdgeNode> getAllNodes() {
        return edgeNodeMapper.selectList(null);
    }

    public List<EdgeNode> getAvailableNodes() {
        return edgeNodeMapper.selectList(new QueryWrapper<EdgeNode>()
                .eq("status", 1));
    }

    public IPage<EdgeNode> getNodePage(Integer pageNum, Integer pageSize, String dataCenter, Integer status) {
        Page<EdgeNode> page = new Page<>(pageNum, pageSize);
        QueryWrapper<EdgeNode> wrapper = new QueryWrapper<>();
        if (dataCenter != null) {
            wrapper.eq("data_center", dataCenter);
        }
        if (status != null) {
            wrapper.eq("status", status);
        }
        wrapper.orderByDesc("create_time");
        return edgeNodeMapper.selectPage(page, wrapper);
    }

    public Boolean addNode(EdgeNode node) {
        EdgeNode existNode = edgeNodeMapper.selectOne(new QueryWrapper<EdgeNode>()
                .eq("node_code", node.getNodeCode()));
        if (existNode != null) {
            throw new BusinessException("节点编码已存在");
        }
        node.setCreateTime(LocalDateTime.now());
        node.setUpdateTime(LocalDateTime.now());
        node.setStatus(1);
        node.setLoadLevel(1);
        node.setCurrentDevices(0);
        return edgeNodeMapper.insert(node) > 0;
    }

    public Boolean updateNode(EdgeNode node) {
        EdgeNode existNode = edgeNodeMapper.selectById(node.getId());
        if (existNode == null) {
            throw new BusinessException(ResultCode.NOT_FOUND);
        }
        node.setUpdateTime(LocalDateTime.now());
        return edgeNodeMapper.updateById(node) > 0;
    }

    public Boolean deleteNode(Long id) {
        EdgeNode existNode = edgeNodeMapper.selectById(id);
        if (existNode == null) {
            throw new BusinessException(ResultCode.NOT_FOUND);
        }
        return edgeNodeMapper.deleteById(id) > 0;
    }

    public Boolean nodeHeartbeat(String nodeCode) {
        EdgeNode node = edgeNodeMapper.selectOne(new QueryWrapper<EdgeNode>()
                .eq("node_code", nodeCode));
        if (node == null) {
            log.warn("心跳节点不存在: {}", nodeCode);
            return false;
        }
        node.setLastHeartbeat(LocalDateTime.now());
        if (node.getStatus() != 1) {
            node.setStatus(1);
            log.info("边缘节点重新上线: {}", nodeCode);
        }
        node.setUpdateTime(LocalDateTime.now());
        return edgeNodeMapper.updateById(node) > 0;
    }

    public EdgeNode allocateEdgeNode() {
        List<EdgeNode> availableNodes = getAvailableNodes();
        if (CollectionUtils.isEmpty(availableNodes)) {
            throw new BusinessException(ResultCode.SCHEDULE_FAILED);
        }

        availableNodes = availableNodes.stream()
                .filter(node -> node.getCurrentDevices() < node.getMaxDevices())
                .sorted(Comparator.comparingInt(EdgeNode::getLoadLevel)
                        .thenComparingInt(EdgeNode::getCurrentDevices))
                .collect(Collectors.toList());

        if (CollectionUtils.isEmpty(availableNodes)) {
            throw new BusinessException(ResultCode.SCHEDULE_FAILED);
        }

        EdgeNode selectedNode = availableNodes.get(0);
        selectedNode.setCurrentDevices(selectedNode.getCurrentDevices() + 1);
        selectedNode.setLoadLevel(calculateLoadLevel(selectedNode));
        edgeNodeMapper.updateById(selectedNode);

        log.info("分配边缘节点成功: nodeCode={}, currentDevices={}",
                selectedNode.getNodeCode(), selectedNode.getCurrentDevices());
        return selectedNode;
    }

    private Integer calculateLoadLevel(EdgeNode node) {
        if (node.getMaxDevices() == 0) {
            return 1;
        }
        double loadRatio = (double) node.getCurrentDevices() / node.getMaxDevices();
        if (loadRatio < 0.3) {
            return 1;
        } else if (loadRatio < 0.6) {
            return 2;
        } else if (loadRatio < 0.9) {
            return 3;
        } else {
            return 4;
        }
    }

    public Boolean releaseEdgeNode(String nodeCode) {
        EdgeNode node = edgeNodeMapper.selectOne(new QueryWrapper<EdgeNode>()
                .eq("node_code", nodeCode));
        if (node == null) {
            return false;
        }
        if (node.getCurrentDevices() > 0) {
            node.setCurrentDevices(node.getCurrentDevices() - 1);
            node.setLoadLevel(calculateLoadLevel(node));
            node.setUpdateTime(LocalDateTime.now());
            edgeNodeMapper.updateById(node);
            log.info("释放边缘节点: nodeCode={}, currentDevices={}", nodeCode, node.getCurrentDevices());
        }
        return true;
    }

    public Boolean scheduleSamplingTask(Long edgeNodeId, List<Long> deviceIds) {
        EdgeNode node = edgeNodeMapper.selectById(edgeNodeId);
        if (node == null || node.getStatus() != 1) {
            throw new BusinessException(ResultCode.SCHEDULE_FAILED);
        }

        Result<List<Device>> devicesResult = deviceFeignClient.getDeviceByIds(deviceIds);
        if (!devicesResult.isSuccess() || CollectionUtils.isEmpty(devicesResult.getData())) {
            throw new BusinessException(ResultCode.SCHEDULE_FAILED);
        }

        for (Device device : devicesResult.getData()) {
            device.setEdgeNode(node.getNodeCode());
        }

        log.info("调度采样任务成功: edgeNode={}, deviceCount={}", node.getNodeCode(), deviceIds.size());
        return true;
    }
}
