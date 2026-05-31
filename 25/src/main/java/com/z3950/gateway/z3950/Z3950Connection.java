package com.z3950.gateway.z3950;

import com.z3950.gateway.config.Z3950Config;

import java.util.List;

public interface Z3950Connection {
    void connect(Z3950Config.ServerConfig config) throws Exception;
    void disconnect();
    boolean isConnected();
    List<byte[]> search(String query, int maxRecords) throws Exception;
    String getServerName();
}
