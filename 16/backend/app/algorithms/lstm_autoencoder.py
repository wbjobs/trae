import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from typing import Dict, List, Tuple, Optional
from sklearn.preprocessing import MinMaxScaler


class LSTMAutoencoder(nn.Module):
    def __init__(
        self,
        input_dim: int,
        hidden_dim: int = 64,
        latent_dim: int = 16,
        num_layers: int = 2,
        dropout: float = 0.2,
    ):
        super(LSTMAutoencoder, self).__init__()
        
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.latent_dim = latent_dim
        self.num_layers = num_layers
        
        self.encoder_lstm = nn.LSTM(
            input_size=input_dim,
            hidden_size=hidden_dim,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0,
        )
        
        self.encoder_fc = nn.Linear(hidden_dim, latent_dim)
        
        self.decoder_fc = nn.Linear(latent_dim, hidden_dim)
        
        self.decoder_lstm = nn.LSTM(
            input_size=hidden_dim,
            hidden_size=hidden_dim,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0,
        )
        
        self.output_fc = nn.Linear(hidden_dim, input_dim)
        
        self.scaler = MinMaxScaler()
        self.is_fitted = False

    def encode(self, x: torch.Tensor) -> torch.Tensor:
        batch_size = x.size(0)
        _, (h_n, _) = self.encoder_lstm(x)
        h_last = h_n[-1, :, :]
        latent = self.encoder_fc(h_last)
        return latent

    def decode(self, latent: torch.Tensor, seq_len: int) -> torch.Tensor:
        batch_size = latent.size(0)
        h = self.decoder_fc(latent)
        
        h_repeated = h.unsqueeze(1).repeat(1, seq_len, 1)
        
        output, _ = self.decoder_lstm(h_repeated)
        reconstructed = self.output_fc(output)
        return reconstructed

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        seq_len = x.size(1)
        latent = self.encode(x)
        reconstructed = self.decode(latent, seq_len)
        return reconstructed


class LSTMAutoencoderDetector:
    def __init__(
        self,
        input_dim: int,
        sequence_length: int = 30,
        hidden_dim: int = 64,
        latent_dim: int = 16,
        epochs: int = 50,
        batch_size: int = 32,
        learning_rate: float = 0.001,
        device: str = "cpu",
    ):
        self.sequence_length = sequence_length
        self.input_dim = input_dim
        self.epochs = epochs
        self.batch_size = batch_size
        self.learning_rate = learning_rate
        self.device = torch.device(device)
        
        self.model = LSTMAutoencoder(
            input_dim=input_dim,
            hidden_dim=hidden_dim,
            latent_dim=latent_dim,
        ).to(self.device)
        
        self.criterion = nn.MSELoss()
        self.optimizer = torch.optim.Adam(
            self.model.parameters(),
            lr=learning_rate,
        )
        
        self.reconstruction_threshold = None
        self.is_trained = False

    def create_sequences(self, data: np.ndarray) -> np.ndarray:
        if len(data) < self.sequence_length:
            return np.array([])
        
        sequences = []
        for i in range(len(data) - self.sequence_length + 1):
            sequences.append(data[i : i + self.sequence_length])
        
        return np.array(sequences)

    def preprocess(self, data: np.ndarray, fit: bool = False) -> np.ndarray:
        if data.ndim == 1:
            data = data.reshape(-1, 1)
        
        if fit:
            data = self.model.scaler.fit_transform(data)
            self.model.is_fitted = True
        else:
            data = self.model.scaler.transform(data)
        
        return data

    def fit(self, data: np.ndarray, verbose: bool = False) -> Dict:
        normalized = self.preprocess(data, fit=True)
        sequences = self.create_sequences(normalized)
        
        if len(sequences) == 0:
            return {"loss": [], "trained": False}
        
        tensor_data = torch.FloatTensor(sequences).to(self.device)
        dataset = TensorDataset(tensor_data, tensor_data)
        dataloader = DataLoader(dataset, batch_size=self.batch_size, shuffle=True)
        
        loss_history = []
        
        self.model.train()
        for epoch in range(self.epochs):
            epoch_loss = 0.0
            for batch_X, _ in dataloader:
                self.optimizer.zero_grad()
                output = self.model(batch_X)
                loss = self.criterion(output, batch_X)
                loss.backward()
                self.optimizer.step()
                epoch_loss += loss.item()
            
            avg_loss = epoch_loss / len(dataloader)
            loss_history.append(avg_loss)
            
            if verbose and (epoch + 1) % 10 == 0:
                print(f"Epoch {epoch+1}/{self.epochs}, Loss: {avg_loss:.6f}")
        
        self.model.eval()
        with torch.no_grad():
            reconstructions = self.model(tensor_data)
            errors = torch.mean((tensor_data - reconstructions) ** 2, dim=(1, 2)).cpu().numpy()
        
        self.reconstruction_threshold = float(
            np.mean(errors) + 3 * np.std(errors)
        )
        self.is_trained = True
        
        return {
            "loss_history": loss_history,
            "threshold": self.reconstruction_threshold,
            "mean_error": float(np.mean(errors)),
            "std_error": float(np.std(errors)),
        }

    def detect_anomalies(
        self,
        data: np.ndarray,
        custom_threshold: Optional[float] = None,
    ) -> Tuple[np.ndarray, List[Dict]]:
        if not self.is_trained:
            raise RuntimeError("Model must be trained before detection")
        
        normalized = self.preprocess(data, fit=False)
        sequences = self.create_sequences(normalized)
        
        if len(sequences) == 0:
            return np.array([]), []
        
        tensor_data = torch.FloatTensor(sequences).to(self.device)
        
        self.model.eval()
        with torch.no_grad():
            reconstructions = self.model(tensor_data)
            errors = torch.mean((tensor_data - reconstructions) ** 2, dim=(1, 2)).cpu().numpy()
        
        threshold = custom_threshold if custom_threshold is not None else self.reconstruction_threshold
        
        anomaly_scores = errors
        anomaly_flags = anomaly_scores > threshold
        
        anomalies = []
        for idx in range(len(sequences)):
            if anomaly_flags[idx]:
                anomalies.append({
                    "sequence_index": idx,
                    "start_position": idx,
                    "end_position": idx + self.sequence_length,
                    "reconstruction_error": float(anomaly_scores[idx]),
                    "threshold": float(threshold),
                    "anomaly_score": float(anomaly_scores[idx] / threshold),
                })
        
        return anomaly_scores, anomalies

    def compute_single_anomaly_score(self, sequence: np.ndarray) -> float:
        if not self.is_trained:
            return 0.0
        
        normalized = self.preprocess(sequence.reshape(-1, 1), fit=False)
        
        if len(normalized) < self.sequence_length:
            padded = np.zeros((self.sequence_length, self.input_dim))
            padded[-len(normalized):] = normalized[-self.sequence_length:]
            normalized = padded
        
        tensor_data = torch.FloatTensor(normalized).unsqueeze(0).to(self.device)
        
        self.model.eval()
        with torch.no_grad():
            reconstruction = self.model(tensor_data)
            error = torch.mean((tensor_data - reconstruction) ** 2).cpu().item()
        
        return float(error)
