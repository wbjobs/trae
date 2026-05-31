package com.anomaly.ml.isolationforest;

import java.io.Serializable;
import java.util.Random;

public class IsolationTree implements Serializable {
    private static final long serialVersionUID = 1L;
    
    private final int maxDepth;
    private final Random random;
    private Node root;
    
    public IsolationTree(int maxDepth, Random random) {
        this.maxDepth = maxDepth;
        this.random = random;
    }
    
    public void fit(double[][] data) {
        root = buildTree(data, 0);
    }
    
    private Node buildTree(double[][] data, int currentDepth) {
        if (currentDepth >= maxDepth || data.length <= 1) {
            return new Node(data.length);
        }
        
        int numFeatures = data[0].length;
        int splitFeature = random.nextInt(numFeatures);
        
        double minVal = Double.MAX_VALUE;
        double maxVal = Double.MIN_VALUE;
        for (double[] row : data) {
            minVal = Math.min(minVal, row[splitFeature]);
            maxVal = Math.max(maxVal, row[splitFeature]);
        }
        
        if (minVal == maxVal) {
            return new Node(data.length);
        }
        
        double splitValue = minVal + random.nextDouble() * (maxVal - minVal);
        
        int leftCount = 0;
        for (double[] row : data) {
            if (row[splitFeature] < splitValue) {
                leftCount++;
            }
        }
        
        double[][] leftData = new double[leftCount][numFeatures];
        double[][] rightData = new double[data.length - leftCount][numFeatures];
        int leftIdx = 0, rightIdx = 0;
        for (double[] row : data) {
            if (row[splitFeature] < splitValue) {
                leftData[leftIdx++] = row;
            } else {
                rightData[rightIdx++] = row;
            }
        }
        
        Node node = new Node(splitFeature, splitValue);
        node.left = buildTree(leftData, currentDepth + 1);
        node.right = buildTree(rightData, currentDepth + 1);
        return node;
    }
    
    public double pathLength(double[] instance) {
        return pathLength(root, instance, 0);
    }
    
    private double pathLength(Node node, double[] instance, int currentDepth) {
        if (node.isLeaf) {
            return currentDepth + cFactor(node.size);
        }
        if (instance[node.splitFeature] < node.splitValue) {
            return pathLength(node.left, instance, currentDepth + 1);
        } else {
            return pathLength(node.right, instance, currentDepth + 1);
        }
    }
    
    private double cFactor(int n) {
        if (n <= 1) return 0;
        return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1) / n);
    }
    
    private static class Node implements Serializable {
        private static final long serialVersionUID = 1L;
        boolean isLeaf;
        int splitFeature;
        double splitValue;
        int size;
        Node left;
        Node right;
        
        Node(int size) {
            this.isLeaf = true;
            this.size = size;
        }
        
        Node(int splitFeature, double splitValue) {
            this.isLeaf = false;
            this.splitFeature = splitFeature;
            this.splitValue = splitValue;
        }
    }
}
