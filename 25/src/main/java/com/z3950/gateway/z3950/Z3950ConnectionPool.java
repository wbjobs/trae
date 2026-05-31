package com.z3950.gateway.z3950;

import com.z3950.gateway.config.Z3950Config;
import org.apache.commons.pool.BasePoolableObjectFactory;
import org.apache.commons.pool.impl.GenericObjectPool;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

@Component
public class Z3950ConnectionPool {
    private final Map<String, GenericObjectPool<Z3950Connection>> pools = new HashMap<>();
    private final Z3950Config config;

    @Autowired
    public Z3950ConnectionPool(Z3950Config config) {
        this.config = config;
        initializePools();
    }

    private void initializePools() {
        if (config.getServers() == null) return;

        for (Z3950Config.ServerConfig serverConfig : config.getServers()) {
            GenericObjectPool.Config poolConfig = new GenericObjectPool.Config();
            poolConfig.maxIdle = config.getPool().getMaxIdle();
            poolConfig.maxActive = config.getPool().getMaxActive();
            poolConfig.maxWait = config.getPool().getMaxWait();
            poolConfig.testOnBorrow = true;
            poolConfig.testWhileIdle = true;
            poolConfig.timeBetweenEvictionRunsMillis = 60000;
            poolConfig.minEvictableIdleTimeMillis = 300000;

            GenericObjectPool<Z3950Connection> pool = new GenericObjectPool<>(
                new Z3950ConnectionFactory(serverConfig),
                poolConfig
            );

            pools.put(serverConfig.getName(), pool);
        }
    }

    public Z3950Connection borrowConnection(String serverName) throws Exception {
        GenericObjectPool<Z3950Connection> pool = pools.get(serverName);
        if (pool == null) {
            throw new IllegalArgumentException("No pool configured for server: " + serverName);
        }
        return pool.borrowObject();
    }

    public void returnConnection(String serverName, Z3950Connection connection) {
        GenericObjectPool<Z3950Connection> pool = pools.get(serverName);
        if (pool != null && connection != null) {
            try {
                pool.returnObject(connection);
            } catch (Exception e) {
                try {
                    pool.invalidateObject(connection);
                } catch (Exception ex) {
                    // Ignore
                }
            }
        }
    }

    public void close() {
        for (GenericObjectPool<Z3950Connection> pool : pools.values()) {
            try {
                pool.close();
            } catch (Exception e) {
                // Ignore
            }
        }
    }

    private static class Z3950ConnectionFactory extends BasePoolableObjectFactory<Z3950Connection> {
        private final Z3950Config.ServerConfig serverConfig;

        public Z3950ConnectionFactory(Z3950Config.ServerConfig serverConfig) {
            this.serverConfig = serverConfig;
        }

        @Override
        public Z3950Connection makeObject() throws Exception {
            Z3950Connection connection = new MockZ3950Connection();
            connection.connect(serverConfig);
            return connection;
        }

        @Override
        public boolean validateObject(Z3950Connection connection) {
            return connection != null && connection.isConnected();
        }

        @Override
        public void destroyObject(Z3950Connection connection) throws Exception {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }
}
