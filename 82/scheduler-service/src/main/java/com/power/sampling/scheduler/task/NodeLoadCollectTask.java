package com.power.sampling.scheduler.task;

import com.power.sampling.scheduler.service.NodeLoadStatsService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class NodeLoadCollectTask {

    @Autowired
    private NodeLoadStatsService nodeLoadStatsService;

    @Scheduled(cron = "0 */1 * * * ?")
    public void collectNodeLoad() {
        try {
            nodeLoadStatsService.collectNodeLoadStats();
        } catch (Exception e) {
            log.error("节点负载采集任务异常", e);
        }
    }
}
