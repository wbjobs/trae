import pandas as pd
import numpy as np
from sklearn.cluster import KMeans, DBSCAN, IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import IsolationForest as IForest
from sklearn.metrics import silhouette_score, calinski_harabasz_score
import warnings
warnings.filterwarnings('ignore')

from config.config import ANOMALY_CONFIG


class ClusteringAnalyzer:
    def __init__(self, method=None, n_clusters=None):
        self.method = method or ANOMALY_CONFIG.get('clustering_method', 'kmeans')
        self.n_clusters = n_clusters or ANOMALY_CONFIG.get('n_clusters', 5)
        self.contamination = ANOMALY_CONFIG.get('contamination', 0.05)
        self.scaler = StandardScaler()
        self.model = None
        self.labels = None
        self.cluster_centers = None

    def prepare_features(self, df, features=None):
        if features is None:
            features = ANOMALY_CONFIG.get('features', ['power', 'current', 'voltage', 'power_factor'])
        
        available_features = [f for f in features if f in df.columns]
        if not available_features:
            raise ValueError("没有可用的特征列")
        
        X = df[available_features].copy()
        X = X.fillna(X.mean())
        X_scaled = self.scaler.fit_transform(X)
        
        return X_scaled, available_features

    def fit_kmeans(self, X, n_clusters=None):
        n_clusters = n_clusters or self.n_clusters
        self.model = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        self.labels = self.model.fit_predict(X)
        self.cluster_centers = self.model.cluster_centers_
        return self.labels

    def fit_dbscan(self, X, eps=0.5, min_samples=5):
        self.model = DBSCAN(eps=eps, min_samples=min_samples)
        self.labels = self.model.fit_predict(X)
        return self.labels

    def fit_isolation_forest(self, X, contamination=None):
        contamination = contamination or self.contamination
        self.model = IForest(contamination=contamination, random_state=42)
        self.labels = self.model.fit_predict(X)
        self.labels = np.where(self.labels == -1, 1, 0)
        return self.labels

    def fit(self, df, features=None):
        X, feature_names = self.prepare_features(df, features)
        
        if self.method == 'kmeans':
            self.fit_kmeans(X)
        elif self.method == 'dbscan':
            self.fit_dbscan(X)
        elif self.method == 'isolation_forest':
            self.fit_isolation_forest(X)
        else:
            raise ValueError(f"不支持的聚类方法: {self.method}")
        
        result_df = df.copy()
        result_df['cluster'] = self.labels
        
        if self.method != 'isolation_forest':
            result_df = self._identify_anomalous_clusters(result_df, X)
        
        return result_df

    def _identify_anomalous_clusters(self, df, X):
        if self.method == 'kmeans':
            distances = self.model.transform(X)
            min_distances = np.min(distances, axis=1)
            threshold = np.percentile(min_distances, 95)
            df['anomaly_score'] = min_distances
            df['is_anomaly'] = (min_distances > threshold).astype(int)
        
        elif self.method == 'dbscan':
            df['is_anomaly'] = (df['cluster'] == -1).astype(int)
            df['anomaly_score'] = np.where(df['is_anomaly'] == 1, 1, 0)
        
        return df

    def evaluate_clustering(self, X):
        if self.labels is None:
            raise ValueError("模型尚未训练")
        
        unique_labels = np.unique(self.labels)
        if len(unique_labels) < 2:
            return None
        
        metrics = {}
        
        if len(unique_labels) > 1 and -1 not in unique_labels:
            metrics['silhouette_score'] = silhouette_score(X, self.labels)
            metrics['calinski_harabasz_score'] = calinski_harabasz_score(X, self.labels)
        
        metrics['n_clusters'] = len(unique_labels)
        metrics['cluster_sizes'] = dict(zip(*np.unique(self.labels, return_counts=True)))
        
        return metrics

    def get_cluster_info(self, df, feature_names):
        cluster_info = []
        
        for cluster_id in np.unique(df['cluster']):
            cluster_data = df[df['cluster'] == cluster_id]
            
            info = {
                'cluster_id': cluster_id,
                'size': len(cluster_data),
                'percentage': len(cluster_data) / len(df) * 100,
                'is_anomaly': cluster_data['is_anomaly'].iloc[0] if 'is_anomaly' in cluster_data.columns else 0
            }
            
            for feature in feature_names:
                info[f'{feature}_mean'] = cluster_data[feature].mean()
                info[f'{feature}_std'] = cluster_data[feature].std()
                info[f'{feature}_max'] = cluster_data[feature].max()
                info[f'{feature}_min'] = cluster_data[feature].min()
            
            cluster_info.append(info)
        
        return pd.DataFrame(cluster_info)

    def predict(self, df, features=None):
        if self.model is None:
            raise ValueError("模型尚未训练")
        
        X, feature_names = self.prepare_features(df, features)
        
        if self.method == 'isolation_forest':
            predictions = self.model.predict(X)
            return np.where(predictions == -1, 1, 0)
        else:
            return self.model.predict(X)

    def find_optimal_clusters(self, X, max_clusters=10):
        inertias = []
        silhouette_scores = []
        
        for k in range(2, max_clusters + 1):
            kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
            labels = kmeans.fit_predict(X)
            inertias.append(kmeans.inertia_)
            silhouette_scores.append(silhouette_score(X, labels))
        
        return {
            'n_clusters': list(range(2, max_clusters + 1)),
            'inertia': inertias,
            'silhouette_score': silhouette_scores
        }
