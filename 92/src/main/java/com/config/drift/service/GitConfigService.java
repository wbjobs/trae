package com.config.drift.service;

import com.config.drift.config.GitConfigProperties;
import com.config.drift.model.ConfigSnapshot;
import com.config.drift.model.DriftItem;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.eclipse.jgit.api.Git;
import org.eclipse.jgit.api.errors.GitAPIException;
import org.eclipse.jgit.transport.UsernamePasswordCredentialsProvider;
import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.DumperOptions;
import org.yaml.snakeyaml.Yaml;

import java.io.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class GitConfigService {

    private final GitConfigProperties gitConfigProperties;

    public ConfigSnapshot fetchConfig(String serviceName, boolean isBaseline) throws GitAPIException, IOException {
        GitConfigProperties.ServiceConfig serviceConfig = gitConfigProperties.getServices().get(serviceName);
        if (serviceConfig == null) {
            throw new IllegalArgumentException("Service not found: " + serviceName);
        }

        String branch = isBaseline ? gitConfigProperties.getBaselineBranch() : serviceConfig.getBranch();
        Path repoDir = Path.of(gitConfigProperties.getLocalRepoDir(), serviceName);
        Files.createDirectories(repoDir);

        Git git = cloneOrPull(repoDir.toFile(), serviceConfig, branch);
        String commitId = git.getRepository().resolve("HEAD").getName();

        File configFile = new File(repoDir.toFile(), serviceConfig.getConfigPath());
        Map<String, Object> configData = loadYamlConfig(configFile);

        ConfigSnapshot snapshot = new ConfigSnapshot();
        snapshot.setServiceName(serviceName);
        snapshot.setGitUrl(serviceConfig.getGitUrl());
        snapshot.setBranch(branch);
        snapshot.setCommitId(commitId);
        snapshot.setConfigPath(serviceConfig.getConfigPath());
        snapshot.setConfigData(configData);
        snapshot.setConfigVersion(commitId.substring(0, 7));
        snapshot.setSnapshotTime(LocalDateTime.now());
        snapshot.setBaseline(isBaseline);

        git.close();
        return snapshot;
    }

    public ConfigSnapshot fetchConfig(String serviceName, String commitId) throws GitAPIException, IOException {
        GitConfigProperties.ServiceConfig serviceConfig = gitConfigProperties.getServices().get(serviceName);
        if (serviceConfig == null) {
            throw new IllegalArgumentException("Service not found: " + serviceName);
        }

        Path repoDir = Path.of(gitConfigProperties.getLocalRepoDir(), serviceName);
        Files.createDirectories(repoDir);

        Git git = cloneOrPull(repoDir.toFile(), serviceConfig, serviceConfig.getBranch());
        git.checkout().setName(commitId).call();

        String resolvedCommitId = git.getRepository().resolve("HEAD").getName();
        File configFile = new File(repoDir.toFile(), serviceConfig.getConfigPath());
        Map<String, Object> configData = loadYamlConfig(configFile);

        ConfigSnapshot snapshot = new ConfigSnapshot();
        snapshot.setServiceName(serviceName);
        snapshot.setGitUrl(serviceConfig.getGitUrl());
        snapshot.setBranch(serviceConfig.getBranch());
        snapshot.setCommitId(resolvedCommitId);
        snapshot.setConfigPath(serviceConfig.getConfigPath());
        snapshot.setConfigData(configData);
        snapshot.setConfigVersion(resolvedCommitId.substring(0, 7));
        snapshot.setSnapshotTime(LocalDateTime.now());
        snapshot.setBaseline(false);

        git.close();
        return snapshot;
    }

    public String rollbackConfig(String serviceName, ConfigSnapshot baseline, List<DriftItem> drifts,
                                 String commitMessage, String authorName, String authorEmail)
            throws GitAPIException, IOException {
        GitConfigProperties.ServiceConfig serviceConfig = gitConfigProperties.getServices().get(serviceName);
        if (serviceConfig == null) {
            throw new IllegalArgumentException("Service not found: " + serviceName);
        }

        Path repoDir = Path.of(gitConfigProperties.getLocalRepoDir(), serviceName);
        Files.createDirectories(repoDir);

        Git git = cloneOrPull(repoDir.toFile(), serviceConfig, serviceConfig.getBranch());
        try {
            String beforeCommitId = git.getRepository().resolve("HEAD").getName();
            File configFile = new File(repoDir.toFile(), serviceConfig.getConfigPath());
            Map<String, Object> currentConfig = loadYamlConfig(configFile);

            applyRollback(currentConfig, baseline.getConfigData(), drifts);

            saveYamlConfig(configFile, currentConfig);

            git.add().addFilepattern(serviceConfig.getConfigPath()).call();
            git.commit()
                    .setMessage(commitMessage)
                    .setAuthor(authorName, authorEmail)
                    .call();

            UsernamePasswordCredentialsProvider credentials = null;
            if (serviceConfig.getUsername() != null && serviceConfig.getPassword() != null) {
                credentials = new UsernamePasswordCredentialsProvider(
                        serviceConfig.getUsername(), serviceConfig.getPassword());
            }
            git.push().setCredentialsProvider(credentials).call();

            String newCommitId = git.getRepository().resolve("HEAD").getName();
            log.info("Rolled back config for {}: {} -> {}", serviceName, beforeCommitId, newCommitId);
            return newCommitId;
        } finally {
            git.close();
        }
    }

    @SuppressWarnings("unchecked")
    private void applyRollback(Map<String, Object> currentConfig, Map<String, Object> baselineConfig,
                               List<DriftItem> drifts) {
        for (DriftItem drift : drifts) {
            String key = drift.getKey();
            switch (drift.getDriftType()) {
                case ADDED:
                    removeNestedValue(currentConfig, key);
                    break;
                case REMOVED:
                case MODIFIED:
                    Object baselineValue = getNestedValue(baselineConfig, key);
                    setNestedValue(currentConfig, key, baselineValue);
                    break;
            }
        }
    }

    @SuppressWarnings("unchecked")
    private Object getNestedValue(Map<String, Object> map, String key) {
        String[] keys = key.split("\\.");
        Object value = map;
        for (String k : keys) {
            if (value instanceof Map) {
                value = ((Map<String, Object>) value).get(k);
            } else {
                return null;
            }
        }
        return value;
    }

    @SuppressWarnings("unchecked")
    private void setNestedValue(Map<String, Object> map, String key, Object value) {
        String[] keys = key.split("\\.");
        Map<String, Object> current = map;
        for (int i = 0; i < keys.length - 1; i++) {
            String k = keys[i];
            Object next = current.get(k);
            if (!(next instanceof Map)) {
                next = new LinkedHashMap<String, Object>();
                current.put(k, next);
            }
            current = (Map<String, Object>) next;
        }
        current.put(keys[keys.length - 1], value);
    }

    @SuppressWarnings("unchecked")
    private void removeNestedValue(Map<String, Object> map, String key) {
        String[] keys = key.split("\\.");
        Map<String, Object> current = map;
        for (int i = 0; i < keys.length - 1; i++) {
            String k = keys[i];
            Object next = current.get(k);
            if (!(next instanceof Map)) {
                return;
            }
            current = (Map<String, Object>) next;
        }
        current.remove(keys[keys.length - 1]);
    }

    private Git cloneOrPull(File repoDir, GitConfigProperties.ServiceConfig config, String branch) throws GitAPIException {
        if (!new File(repoDir, ".git").exists()) {
            log.info("Cloning repository: {} to {}", config.getGitUrl(), repoDir);
            Git.CloneCommand cloneCommand = Git.cloneRepository()
                    .setURI(config.getGitUrl())
                    .setDirectory(repoDir)
                    .setBranch(branch);

            if (config.getUsername() != null && config.getPassword() != null) {
                cloneCommand.setCredentialsProvider(
                        new UsernamePasswordCredentialsProvider(config.getUsername(), config.getPassword()));
            }
            return cloneCommand.call();
        } else {
            log.info("Pulling latest changes for repository: {}", repoDir);
            Git git = Git.open(repoDir);
            git.checkout().setName(branch).call();
            git.pull().call();
            return git;
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> loadYamlConfig(File configFile) throws IOException {
        if (!configFile.exists()) {
            throw new IOException("Config file not found: " + configFile.getAbsolutePath());
        }
        Yaml yaml = new Yaml();
        try (FileInputStream fis = new FileInputStream(configFile)) {
            Map<String, Object> result = (Map<String, Object>) yaml.load(fis);
            return result != null ? result : new LinkedHashMap<>();
        }
    }

    private void saveYamlConfig(File configFile, Map<String, Object> configData) throws IOException {
        Files.createDirectories(configFile.getParentFile().toPath());
        DumperOptions options = new DumperOptions();
        options.setDefaultFlowStyle(DumperOptions.FlowStyle.BLOCK);
        options.setPrettyFlow(true);
        options.setIndent(2);
        Yaml yaml = new Yaml(options);
        try (FileWriter writer = new FileWriter(configFile)) {
            yaml.dump(configData, writer);
        }
    }
}
