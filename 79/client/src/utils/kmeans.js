export class KMeans {
    constructor(k = 3, maxIterations = 100, tolerance = 0.001) {
        this.k = k;
        this.maxIterations = maxIterations;
        this.tolerance = tolerance;
        this.centroids = [];
        this.labels = [];
    }

    fit(data) {
        if (data.length === 0) return [];
        
        const featureVectors = data.map(d => this.extractFeatures(d));
        
        this.centroids = this.initializeCentroids(featureVectors);
        this.labels = new Array(data.length).fill(0);
        
        let iterations = 0;
        let oldCentroids = JSON.parse(JSON.stringify(this.centroids));
        
        while (iterations < this.maxIterations) {
            this.assignClusters(featureVectors);
            this.updateCentroids(featureVectors);
            
            if (this.hasConverged(oldCentroids)) {
                break;
            }
            
            oldCentroids = JSON.parse(JSON.stringify(this.centroids));
            iterations++;
        }
        
        return this.labels;
    }

    extractFeatures(drillLog) {
        const features = [];
        const totalDepth = drillLog.totalDepth;
        
        const layerCount = drillLog.layers.length;
        features.push(layerCount / 10);
        
        const avgThickness = totalDepth / layerCount;
        features.push(avgThickness / 20);
        
        const layerTypes = new Set(drillLog.layers.map(l => l.layerId));
        features.push(layerTypes.size / 10);
        
        const thicknessVariance = this.calculateVariance(
            drillLog.layers.map(l => l.thickness)
        );
        features.push(thicknessVariance / 100);
        
        const dominantLayer = this.findDominantLayer(drillLog.layers);
        features.push(dominantLayer / 10);
        
        const coalCount = drillLog.layers.filter(l => l.layerId === 7).length;
        features.push(coalCount / 3);
        
        const coalThickness = drillLog.layers
            .filter(l => l.layerId === 7)
            .reduce((sum, l) => sum + l.thickness, 0);
        features.push(coalThickness / 20);
        
        return features;
    }

    calculateVariance(values) {
        if (values.length === 0) return 0;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
        return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
    }

    findDominantLayer(layers) {
        const count = {};
        let maxCount = 0;
        let dominantId = 0;
        
        layers.forEach(layer => {
            count[layer.layerId] = (count[layer.layerId] || 0) + 1;
            if (count[layer.layerId] > maxCount) {
                maxCount = count[layer.layerId];
                dominantId = layer.layerId;
            }
        });
        
        return dominantId;
    }

    initializeCentroids(data) {
        const centroids = [];
        const shuffled = [...data].sort(() => Math.random() - 0.5);
        
        for (let i = 0; i < Math.min(this.k, data.length); i++) {
            centroids.push([...shuffled[i]]);
        }
        
        return centroids;
    }

    assignClusters(data) {
        data.forEach((point, i) => {
            let minDistance = Infinity;
            let closestCentroid = 0;
            
            this.centroids.forEach((centroid, j) => {
                const distance = this.euclideanDistance(point, centroid);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestCentroid = j;
                }
            });
            
            this.labels[i] = closestCentroid;
        });
    }

    updateCentroids(data) {
        const sums = Array(this.k).fill(null).map(() => 
            Array(this.centroids[0].length).fill(0)
        );
        const counts = Array(this.k).fill(0);
        
        data.forEach((point, i) => {
            const cluster = this.labels[i];
            counts[cluster]++;
            point.forEach((val, j) => {
                sums[cluster][j] += val;
            });
        });
        
        this.centroids = sums.map((sum, i) => {
            if (counts[i] === 0) return sum;
            return sum.map(val => val / counts[i]);
        });
    }

    hasConverged(oldCentroids) {
        for (let i = 0; i < this.centroids.length; i++) {
            const distance = this.euclideanDistance(this.centroids[i], oldCentroids[i]);
            if (distance > this.tolerance) {
                return false;
            }
        }
        return true;
    }

    euclideanDistance(a, b) {
        return Math.sqrt(
            a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0)
        );
    }

    predict(newData) {
        const features = this.extractFeatures(newData);
        let minDistance = Infinity;
        let closestCentroid = 0;
        
        this.centroids.forEach((centroid, j) => {
            const distance = this.euclideanDistance(features, centroid);
            if (distance < minDistance) {
                minDistance = distance;
                closestCentroid = j;
            }
        });
        
        return closestCentroid;
    }
}

export function clusterDrillHoles(drillHoles, k = 3) {
    const drillLogs = drillHoles.map(h => h.drillLog);
    const kmeans = new KMeans(k);
    const labels = kmeans.fit(drillLogs);
    
    const clusterColors = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0x95e1d3, 0xf38181, 0xaa96da];
    
    const clusters = {};
    drillHoles.forEach((hole, i) => {
        const label = labels[i];
        hole.cluster = label;
        hole.clusterColor = clusterColors[label % clusterColors.length];
        
        if (!clusters[label]) {
            clusters[label] = [];
        }
        clusters[label].push(hole);
    });
    
    return {
        clusters,
        labels,
        centroids: kmeans.centroids,
        clusterColors
    };
}

export function calculateSimilarity(drillLog1, drillLog2) {
    const features1 = new KMeans().extractFeatures(drillLog1);
    const features2 = new KMeans().extractFeatures(drillLog2);
    
    const distance = new KMeans().euclideanDistance(features1, features2);
    const similarity = 1 / (1 + distance);
    
    return similarity;
}
