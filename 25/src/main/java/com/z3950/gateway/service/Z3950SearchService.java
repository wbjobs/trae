package com.z3950.gateway.service;

import com.z3950.gateway.config.Z3950Config;
import com.z3950.gateway.model.Book;
import com.z3950.gateway.util.MarcParser;
import com.z3950.gateway.z3950.Z3950Connection;
import com.z3950.gateway.z3950.Z3950ConnectionPool;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.*;

@Slf4j
@Service
public class Z3950SearchService {
    private final Z3950ConnectionPool connectionPool;
    private final Z3950Config config;
    private final MarcParser marcParser;
    private final ExecutorService executorService;

    @Autowired
    public Z3950SearchService(Z3950ConnectionPool connectionPool, Z3950Config config, MarcParser marcParser) {
        this.connectionPool = connectionPool;
        this.config = config;
        this.marcParser = marcParser;
        this.executorService = Executors.newFixedThreadPool(10);
    }

    public List<Book> searchAllServers(String query, int maxRecordsPerServer) throws InterruptedException, ExecutionException {
        List<Book> allBooks = new ArrayList<>();

        if (config.getServers() == null || config.getServers().isEmpty()) {
            log.warn("No Z39.50 servers configured");
            return allBooks;
        }

        int totalServers = config.getServers().size();
        ExecutorCompletionService<List<Book>> completionService =
            new ExecutorCompletionService<>(executorService);

        List<Future<List<Book>>> submittedFutures = new ArrayList<>();
        for (Z3950Config.ServerConfig serverConfig : config.getServers()) {
            Future<List<Book>> future = completionService.submit(() ->
                searchServer(serverConfig.getName(), query, maxRecordsPerServer)
            );
            submittedFutures.add(future);
        }

        long timeout = config.getTimeoutSeconds() * 1000L;
        long deadline = System.currentTimeMillis() + timeout;
        int completed = 0;

        while (completed < totalServers) {
            long remaining = deadline - System.currentTimeMillis();
            if (remaining <= 0) {
                log.warn("Global timeout reached, returning {} results from {} completed servers",
                    allBooks.size(), completed);
                for (Future<List<Book>> future : submittedFutures) {
                    if (!future.isDone()) {
                        future.cancel(true);
                    }
                }
                break;
            }

            try {
                Future<List<Book>> future = completionService.poll(remaining, TimeUnit.MILLISECONDS);
                if (future == null) {
                    log.warn("Poll timed out, returning partial results");
                    for (Future<List<Book>> f : submittedFutures) {
                        if (!f.isDone()) {
                            f.cancel(true);
                        }
                    }
                    break;
                }

                List<Book> books = future.get();
                allBooks.addAll(books);
                completed++;
            } catch (TimeoutException e) {
                log.warn("Poll timeout, returning results from {} completed servers", completed);
                for (Future<List<Book>> f : submittedFutures) {
                    if (!f.isDone()) {
                        f.cancel(true);
                    }
                }
                break;
            } catch (CancellationException e) {
                completed++;
            } catch (ExecutionException e) {
                completed++;
                log.error("Server search failed", e);
            }
        }

        log.info("Search completed: {} results from {}/{} servers",
            allBooks.size(), completed, totalServers);
        return allBooks;
    }

    private List<Book> searchServer(String serverName, String query, int maxRecords) {
        Z3950Connection connection = null;
        try {
            connection = connectionPool.borrowConnection(serverName);
            List<byte[]> marcRecords = connection.search(query, maxRecords);
            return marcParser.parseMarcRecords(marcRecords, serverName);
        } catch (Exception e) {
            log.error("Error searching server {}: {}", serverName, e.getMessage());
            return new ArrayList<>();
        } finally {
            connectionPool.returnConnection(serverName, connection);
        }
    }

    public List<String> getConfiguredServerNames() {
        List<String> names = new ArrayList<>();
        if (config.getServers() != null) {
            for (Z3950Config.ServerConfig server : config.getServers()) {
                names.add(server.getName());
            }
        }
        return names;
    }
}
