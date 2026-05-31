import os
import numpy as np
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
import yaml
import argparse
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix
import matplotlib.pyplot as plt

class FallDetectionLSTM:
    def __init__(self, config_path, use_3d=False):
        with open(config_path, 'r') as f:
            self.config = yaml.safe_load(f)
        
        self.sequence_length = self.config['lstm']['sequence_length']
        self.num_keypoints = self.config['lstm']['num_keypoints']
        self.use_3d = use_3d or self.config['lstm'].get('use_3d_features', False)
        self.num_features = 6 if self.use_3d else 4
        self.threshold = self.config['lstm']['threshold']
        
        self.input_shape = (self.sequence_length, self.num_keypoints * self.num_features)
        self.model = None
        
        print(f"Mode: {'3D Multi-Camera' if self.use_3d else '2D Single Camera'}")
        print(f"Features per keypoint: {self.num_features}")

    def build_model(self):
        inputs = keras.Input(shape=self.input_shape)
        
        x = layers.LSTM(128, return_sequences=True, dropout=0.2)(inputs)
        x = layers.LSTM(64, return_sequences=False, dropout=0.2)(x)
        x = layers.Dense(32, activation='relu')(x)
        x = layers.Dropout(0.3)(x)
        x = layers.Dense(16, activation='relu')(x)
        outputs = layers.Dense(2, activation='softmax')(x)
        
        self.model = keras.Model(inputs=inputs, outputs=outputs)
        
        self.model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=0.001),
            loss='sparse_categorical_crossentropy',
            metrics=['accuracy']
        )
        
        return self.model

    def generate_synthetic_data(self, num_samples=10000):
        print("Generating synthetic training data...")
        
        features_per_frame = self.num_keypoints * self.num_features
        X = np.zeros((num_samples, self.sequence_length, features_per_frame), dtype=np.float32)
        y = np.zeros((num_samples,), dtype=np.int32)
        
        for i in range(num_samples // 2):
            X[i] = self._generate_normal_sequence()
            y[i] = 0
        
        for i in range(num_samples // 2, num_samples):
            X[i] = self._generate_fall_sequence()
            y[i] = 1
        
        indices = np.random.permutation(num_samples)
        X = X[indices]
        y = y[indices]
        
        return X, y

    def _generate_normal_sequence(self):
        seq = np.zeros((self.sequence_length, self.num_keypoints, self.num_features), dtype=np.float32)
        
        base_y = np.random.uniform(0.3, 0.5)
        base_z = np.random.uniform(-0.5, 0.5)
        height = np.random.uniform(0.3, 0.5)
        
        for t in range(self.sequence_length):
            phase = t / self.sequence_length * 2 * np.pi
            for kp in range(self.num_keypoints):
                x_offset = np.random.uniform(-0.05, 0.05) + np.sin(phase + kp * 0.3) * 0.02
                y_offset = np.sin(phase * 2 + kp * 0.2) * 0.03
                z_offset = np.sin(phase + kp * 0.15) * 0.02
                
                seq[t, kp, 0] = x_offset
                seq[t, kp, 1] = y_offset + (kp / self.num_keypoints) * height
                seq[t, kp, 2] = z_offset
                seq[t, kp, 3] = np.random.uniform(0.8, 1.0)
                
                if self.use_3d:
                    seq[t, kp, 4] = 1.0
                    seq[t, kp, 5] = 1.0
        
        hip_center = (seq[:, 23, :3] + seq[:, 24, :3]) / 2
        
        for t in range(self.sequence_length):
            seq[t, :, 0] -= hip_center[t, 0]
            seq[t, :, 1] -= hip_center[t, 1]
            seq[t, :, 2] -= hip_center[t, 2]
        
        return seq.reshape(self.sequence_length, -1)

    def _generate_fall_sequence(self):
        seq = np.zeros((self.sequence_length, self.num_keypoints, self.num_features), dtype=np.float32)
        
        base_y = np.random.uniform(0.3, 0.5)
        base_z = np.random.uniform(-0.5, 0.5)
        height = np.random.uniform(0.3, 0.5)
        
        fall_speed = np.linspace(0, 1.5, self.sequence_length)
        
        for t in range(self.sequence_length):
            for kp in range(self.num_keypoints):
                fall_offset_y = fall_speed[t] * 0.3
                fall_offset_z = fall_speed[t] * (0.2 + kp / self.num_keypoints * 0.3)
                
                seq[t, kp, 0] = np.random.uniform(-0.05, 0.05)
                seq[t, kp, 1] = fall_offset_y + (kp / self.num_keypoints) * height * (1 - fall_speed[t] * 0.5)
                seq[t, kp, 2] = fall_offset_z
                seq[t, kp, 3] = np.random.uniform(0.7, 1.0)
                
                if self.use_3d:
                    seq[t, kp, 4] = np.random.uniform(0.5, 1.0)
                    seq[t, kp, 5] = 1.0
        
        hip_center = (seq[:, 23, :3] + seq[:, 24, :3]) / 2
        
        for t in range(self.sequence_length):
            seq[t, :, 0] -= hip_center[t, 0]
            seq[t, :, 1] -= hip_center[t, 1]
            seq[t, :, 2] -= hip_center[t, 2]
        
        return seq.reshape(self.sequence_length, -1)

    def generate_occlusion_data(self, base_sequences, base_labels, occlusion_ratio=0.3):
        num_samples = len(base_sequences)
        occluded_X = base_sequences.copy()
        
        for i in range(num_samples):
            if base_labels[i] == 0:
                continue
                
            num_frames = self.sequence_length
            num_keypoints_to_occlude = int(self.num_keypoints * occlusion_ratio)
            
            for t in range(num_frames):
                kp_indices = np.random.choice(self.num_keypoints, num_keypoints_to_occlude, replace=False)
                for kp in kp_indices:
                    start_idx = kp * self.num_features
                    end_idx = start_idx + self.num_features
                    occluded_X[i, t, start_idx:end_idx] = 0.0
                    
                    if self.use_3d:
                        occluded_X[i, t, start_idx + 4] = 0.0
                        occluded_X[i, t, start_idx + 5] = 0.0
        
        return occluded_X, base_labels

    def generate_multiview_data(self, num_samples_per_view=5000):
        print("Generating multi-view training data...")
        
        all_X = []
        all_y = []
        
        for view in range(4):
            X, y = self.generate_synthetic_data(num_samples_per_view)
            all_X.append(X)
            all_y.append(y)
        
        all_X = np.concatenate(all_X, axis=0)
        all_y = np.concatenate(all_y, axis=0)
        
        indices = np.random.permutation(len(all_X))
        return all_X[indices], all_y[indices]

    def train(self, X_train, y_train, X_val, y_val, epochs=50, batch_size=32):
        early_stopping = keras.callbacks.EarlyStopping(
            monitor='val_loss',
            patience=10,
            restore_best_weights=True
        )
        
        reduce_lr = keras.callbacks.ReduceLROnPlateau(
            monitor='val_loss',
            factor=0.5,
            patience=5,
            min_lr=1e-6
        )
        
        history = self.model.fit(
            X_train, y_train,
            validation_data=(X_val, y_val),
            epochs=epochs,
            batch_size=batch_size,
            callbacks=[early_stopping, reduce_lr],
            verbose=1
        )
        
        return history

    def evaluate(self, X_test, y_test):
        y_pred = self.model.predict(X_test)
        y_pred_classes = np.argmax(y_pred, axis=1)
        
        print("\nClassification Report:")
        print(classification_report(y_test, y_pred_classes, target_names=['Normal', 'Fall']))
        
        print("\nConfusion Matrix:")
        print(confusion_matrix(y_test, y_pred_classes))
        
        loss, accuracy = self.model.evaluate(X_test, y_test, verbose=0)
        print(f"\nTest Loss: {loss:.4f}")
        print(f"Test Accuracy: {accuracy:.4f}")
        
        return loss, accuracy

    def evaluate_with_occlusion(self, X_test, y_test):
        print("\n--- Evaluation with Occlusion ---")
        
        for occlusion_ratio in [0.1, 0.2, 0.3, 0.5]:
            X_occluded, y_occluded = self.generate_occlusion_data(
                X_test, y_test, occlusion_ratio=occlusion_ratio)
            
            y_pred = self.model.predict(X_occluded, verbose=0)
            y_pred_classes = np.argmax(y_pred, axis=1)
            
            from sklearn.metrics import accuracy_score, f1_score
            acc = accuracy_score(y_occluded, y_pred_classes)
            f1 = f1_score(y_occluded, y_pred_classes, average='weighted')
            
            print(f"Occlusion {int(occlusion_ratio*100)}% - Accuracy: {acc:.4f}, F1: {f1:.4f}")

    def save_model(self, save_path):
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        self.model.save(save_path)
        print(f"Model saved to {save_path}")

    def convert_to_tflite(self, keras_model_path, tflite_model_path):
        model = keras.models.load_model(keras_model_path)
        
        converter = tf.lite.TFLiteConverter.from_keras_model(model)
        converter.optimizations = [tf.lite.Optimize.DEFAULT]
        converter.target_spec.supported_ops = [
            tf.lite.OpsSet.TFLITE_BUILTINS,
            tf.lite.OpsSet.SELECT_TF_OPS
        ]
        
        tflite_model = converter.convert()
        
        os.makedirs(os.path.dirname(tflite_model_path), exist_ok=True)
        with open(tflite_model_path, 'wb') as f:
            f.write(tflite_model)
        
        print(f"TFLite model saved to {tflite_model_path}")
        print(f"Model size: {len(tflite_model) / 1024:.2f} KB")

    def plot_history(self, history, save_path):
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4))
        
        ax1.plot(history.history['accuracy'], label='Train')
        ax1.plot(history.history['val_accuracy'], label='Validation')
        ax1.set_title('Model Accuracy')
        ax1.set_xlabel('Epoch')
        ax1.set_ylabel('Accuracy')
        ax1.legend()
        
        ax2.plot(history.history['loss'], label='Train')
        ax2.plot(history.history['val_loss'], label='Validation')
        ax2.set_title('Model Loss')
        ax2.set_xlabel('Epoch')
        ax2.set_ylabel('Loss')
        ax2.legend()
        
        plt.tight_layout()
        plt.savefig(save_path)
        print(f"Training history plot saved to {save_path}")

def main():
    parser = argparse.ArgumentParser(description='Train Fall Detection LSTM Model')
    parser.add_argument('--config', type=str, default='../config/config.yaml',
                        help='Path to config file')
    parser.add_argument('--samples', type=int, default=10000,
                        help='Number of synthetic samples to generate')
    parser.add_argument('--epochs', type=int, default=50,
                        help='Number of training epochs')
    parser.add_argument('--batch_size', type=int, default=32,
                        help='Batch size for training')
    parser.add_argument('--output_dir', type=str, default='../models',
                        help='Output directory for models')
    parser.add_argument('--use_3d', action='store_true',
                        help='Train with 3D features for multi-camera')
    parser.add_argument('--multiview', action='store_true',
                        help='Generate multi-view training data')
    parser.add_argument('--test_occlusion', action='store_true',
                        help='Test model robustness against occlusion')
    
    args = parser.parse_args()
    
    trainer = FallDetectionLSTM(args.config, use_3d=args.use_3d)
    
    print(f"Input shape: {trainer.input_shape}")
    print(f"Sequence length: {trainer.sequence_length}")
    print(f"Number of keypoints: {trainer.num_keypoints}")
    print(f"Features per keypoint: {trainer.num_features}")
    
    if args.multiview:
        X, y = trainer.generate_multiview_data(args.samples // 4)
    else:
        X, y = trainer.generate_synthetic_data(num_samples=args.samples)
    
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    X_train, X_val, y_train, y_val = train_test_split(
        X_train, y_train, test_size=0.2, random_state=42, stratify=y_train
    )
    
    print(f"\nTrain samples: {len(X_train)}")
    print(f"Validation samples: {len(X_val)}")
    print(f"Test samples: {len(X_test)}")
    print(f"Class distribution - Train: {np.bincount(y_train)}")
    
    trainer.build_model()
    trainer.model.summary()
    
    print("\nStarting training...")
    history = trainer.train(
        X_train, y_train, X_val, y_val,
        epochs=args.epochs,
        batch_size=args.batch_size
    )
    
    suffix = '_3d' if args.use_3d else ''
    trainer.plot_history(history, os.path.join(args.output_dir, f'training_history{suffix}.png'))
    
    print("\nEvaluating model...")
    trainer.evaluate(X_test, y_test)
    
    if args.test_occlusion:
        trainer.evaluate_with_occlusion(X_test, y_test)
    
    keras_model_path = os.path.join(args.output_dir, f'fall_detection_lstm{suffix}.h5')
    trainer.save_model(keras_model_path)
    
    tflite_model_path = os.path.join(args.output_dir, f'fall_detection_lstm{suffix}.tflite')
    trainer.convert_to_tflite(keras_model_path, tflite_model_path)
    
    print("\nTraining completed successfully!")

if __name__ == '__main__':
    main()
