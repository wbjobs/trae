package com.anomaly.ml.isolationforest;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

public class IsolationForest implements Serializable {
    private static final long serialVersionUID = 1L;
    
    private final int numTrees;
    private final int sampleSize;
    private final int maxDepth;
    private final List<IsolationTree> trees;
    private final Random random;
    
    public IsolationForest(int numTrees, int sampleSize) {
        this.numTrees = numTrees;
        this.sampleSize = sampleSize;
        this.maxDepth = (int) Math.ceil(Math.log(sampleSize) / Math.log(2));
        this.trees = new ArrayList<>();
        this.random = new Random(42);
    }
    
    public void fit(double[][] data) {
        trees.clear();
        for (int i = 0; i < numTrees; i++) {
            double[][] sample = sampleData(data, sampleSize);
            IsolationTree tree = new IsolationTree(maxDepth, random);
            tree.fit(sample);
            trees.add(tree);
        }
    }
    
    public double anomalyScore(double[] instance) {
        double avgPathLength = 0.0;
        for (IsolationTree tree : trees) {
            avgPathLength += tree.pathLength(instance);
        }
        avgPathLength /= trees.size();
        return normalizeScore(avgPathLength, sampleSize);
    }
    
    private double normalizeScore(double avgPathLength, int n) {
        double cN = 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1) / n);
        return Math.pow(2, -avgPathLength / cN);
    }
    
    private double[][] sampleData(double[][] data, int size) {
        int n = Math.min(size, data.length);
        double[][] sample = new double[n][data[0].length];
        List<Integer> indices = new ArrayList<>();
        for (int i = 0; i < data.length; i++) {
            indices.add(i);
        }
        java.util.Collections.shuffle(indices, random);
        for (int i = 0; i < n; i++) {
            sample[i] = data[indices.get(i)].clone();
        }
        return sample;
    }
}
