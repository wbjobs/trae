import numpy as np
from collections import defaultdict, deque
import time
from config import ANOMALY_THRESHOLDS, STOCKS


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-np.clip(x, -500, 500)))


def tanh(x):
    return np.tanh(x)


class LSTMCell:
    def __init__(self, input_size, hidden_size):
        self.input_size = input_size
        self.hidden_size = hidden_size

        self.Wf = np.random.randn(hidden_size, input_size + hidden_size) * 0.1
        self.bf = np.zeros((hidden_size, 1))
        self.Wi = np.random.randn(hidden_size, input_size + hidden_size) * 0.1
        self.bi = np.zeros((hidden_size, 1))
        self.Wc = np.random.randn(hidden_size, input_size + hidden_size) * 0.1
        self.bc = np.zeros((hidden_size, 1))
        self.Wo = np.random.randn(hidden_size, input_size + hidden_size) * 0.1
        self.bo = np.zeros((hidden_size, 1))

    def forward(self, x, h_prev, c_prev):
        x = x.reshape(-1, 1)
        concat = np.vstack((h_prev, x))

        ft = sigmoid(np.dot(self.Wf, concat) + self.bf)
        it = sigmoid(np.dot(self.Wi, concat) + self.bi)
        c_tilde = tanh(np.dot(self.Wc, concat) + self.bc)
        c_next = ft * c_prev + it * c_tilde
        ot = sigmoid(np.dot(self.Wo, concat) + self.bo)
        h_next = ot * tanh(c_next)

        return h_next, c_next


class FlashCrashPredictor:
    def __init__(self):
        self.input_size = 4
        self.hidden_size = 16
        self.output_size = 1
        self.sequence_length = 60

        self.lstm = LSTMCell(self.input_size, self.hidden_size)
        self.Wy = np.random.randn(self.output_size, self.hidden_size) * 0.1
        self.by = np.zeros((self.output_size, 1))

        self.price_history = defaultdict(lambda: deque(maxlen=self.sequence_length * 2))
        self.hidden_states = defaultdict(lambda: (np.zeros((self.hidden_size, 1)), np.zeros((self.hidden_size, 1))))
        self.last_predictions = defaultdict(lambda: deque(maxlen=60))
        self.last_predict_time = defaultdict(float)

        self._init_pretrained_weights()

    def _init_pretrained_weights(self):
        self.Wf = np.array([
            [0.5, -0.3, 0.2, -0.1, 0.4] * 3 + [0.3] * (16 - 15),
            [-0.2, 0.4, -0.5, 0.3, -0.2] * 3 + [0.1] * (16 - 15),
        ] * 8)[:16, :20]

    def _extract_features(self, symbol, current_price, current_time):
        history = list(self.price_history[symbol])
        if len(history) < 10:
            return None

        prices = np.array([h[1] for h in history[-60:]])
        timestamps = np.array([h[0] for h in history[-60:]])

        if len(prices) < 2:
            return None

        price_change = (current_price - prices[-1]) / prices[-1] if prices[-1] > 0 else 0

        if len(prices) >= 10:
            short_ma = np.mean(prices[-10:])
            long_ma = np.mean(prices[-30:]) if len(prices) >= 30 else np.mean(prices)
            ma_diff = (short_ma - long_ma) / long_ma if long_ma > 0 else 0
        else:
            ma_diff = 0

        recent_changes = np.diff(prices[-min(20, len(prices)):]) / prices[-min(20, len(prices)):-1]
        volatility = np.std(recent_changes) if len(recent_changes) > 1 else 0

        recent_returns = np.diff(np.log(np.maximum(prices, 1e-8)))
        negative_count = np.sum(recent_returns < -0.005) if len(recent_returns) > 0 else 0
        selling_pressure = negative_count / len(recent_returns) if len(recent_returns) > 0 else 0

        features = np.array([
            price_change * 100,
            ma_diff * 100,
            volatility * 100,
            selling_pressure * 10,
        ])

        return features

    def update(self, symbol, price, timestamp):
        self.price_history[symbol].append((timestamp, price))

    def predict(self, symbol, current_price, current_time):
        history = list(self.price_history[symbol])
        if len(history) < 30:
            return 0.0

        h, c = self.hidden_states[symbol]

        features_list = []
        start_idx = max(0, len(history) - self.sequence_length)
        for i in range(start_idx, len(history)):
            ts, price = history[i]
            feat = self._extract_features(symbol, price, ts)
            if feat is not None:
                features_list.append(feat)

        if len(features_list) < 10:
            return 0.0

        for feat in features_list[-30:]:
            h, c = self.lstm.forward(feat, h, c)

        output = sigmoid(np.dot(self.Wy, h) + self.by)
        base_prob = float(output[0][0])

        recent_prices = [h[1] for h in history[-30:]]
        if len(recent_prices) >= 10:
            peak = max(recent_prices[-10:])
            current_drop = (peak - current_price) / peak * 100 if peak > 0 else 0

            if current_drop > 1.5:
                base_prob = min(0.95, base_prob + 0.3)
            elif current_drop > 1.0:
                base_prob = min(0.85, base_prob + 0.2)
            elif current_drop > 0.5:
                base_prob = min(0.7, base_prob + 0.1)

            recent_changes = np.diff(recent_prices[-10:]) / recent_prices[-10:-1]
            negative_trend = np.mean(recent_changes) < -0.002
            if negative_trend:
                base_prob = min(0.95, base_prob + 0.15)

            accel = np.diff(recent_changes[-5:]) if len(recent_changes) >= 5 else []
            if len(accel) > 0 and np.mean(accel) < -0.001:
                base_prob = min(0.95, base_prob + 0.1)

        self.hidden_states[symbol] = (h, c)
        return max(0.0, min(1.0, base_prob))


class PredictionManager:
    def __init__(self):
        self.predictor = FlashCrashPredictor()
        self.predictions = defaultdict(list)
        self.prediction_interval = 1.0
        self.last_prediction_time = 0
        self.stock_symbols = [s["symbol"] for s in STOCKS]

    def update_with_tick(self, tick):
        symbol = tick.get("s")
        if not symbol:
            return

        price = tick["p"]
        timestamp = tick["ts"] / 1000.0
        self.predictor.update(symbol, price, timestamp)

    def get_all_predictions(self, current_time):
        if current_time - self.last_prediction_time < self.prediction_interval:
            return None

        self.last_prediction_time = current_time
        predictions = {}

        for symbol in self.stock_symbols:
            history = list(self.predictor.price_history[symbol])
            if not history:
                continue

            last_price = history[-1][1]
            prob = self.predictor.predict(symbol, last_price, current_time)

            predictions[symbol] = {
                "probability": round(prob, 4),
                "price": last_price,
                "timestamp": current_time,
            }

            self.predictions[symbol].append({
                "time": current_time,
                "prob": prob,
            })
            if len(self.predictions[symbol]) > 120:
                self.predictions[symbol].pop(0)

        return predictions

    def get_prediction_history(self, symbol):
        return list(self.predictions.get(symbol, []))
