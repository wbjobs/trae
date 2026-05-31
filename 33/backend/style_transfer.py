import numpy as np
import tensorflow as tf
import tensorflow_hub as hub
from PIL import Image
import io
import os
from typing import List, Dict

class StyleTransferEngine:
    def __init__(self):
        self.models = {}
        self.model_urls = {
            'van_gogh': 'https://tfhub.dev/google/magenta/arbitrary-image-stylization-v1-256/2',
            'picasso': 'https://tfhub.dev/google/magenta/arbitrary-image-stylization-v1-256/2',
            'monet': 'https://tfhub.dev/google/magenta/arbitrary-image-stylization-v1-256/2',
            'sketch': 'https://tfhub.dev/google/magenta/arbitrary-image-stylization-v1-256/2'
        }
        self.style_images = {}
        self._load_style_images()
        self._load_model()

    def _load_model(self):
        model_url = self.model_urls['van_gogh']
        print(f"Loading style transfer model from {model_url}...")
        self.hub_module = hub.load(model_url)
        print("Model loaded successfully.")

    def _load_style_images(self):
        styles_dir = os.path.join(os.path.dirname(__file__), 'styles')
        os.makedirs(styles_dir, exist_ok=True)
        
        self.style_images = {
            'van_gogh': self._create_style_image('starry_night'),
            'picasso': self._create_style_image('cubism'),
            'monet': self._create_style_image('impressionism'),
            'sketch': self._create_style_image('sketch')
        }

    def _create_style_image(self, style_name: str) -> tf.Tensor:
        style_patterns = {
            'starry_night': [
                [0.1, 0.2, 0.5], [0.2, 0.3, 0.6], [0.15, 0.25, 0.55],
                [0.3, 0.4, 0.7], [0.25, 0.35, 0.65], [0.1, 0.15, 0.4]
            ],
            'cubism': [
                [0.8, 0.2, 0.1], [0.2, 0.6, 0.3], [0.1, 0.3, 0.7],
                [0.9, 0.7, 0.1], [0.3, 0.2, 0.5], [0.6, 0.4, 0.2]
            ],
            'impressionism': [
                [0.9, 0.8, 0.7], [0.7, 0.6, 0.5], [0.8, 0.7, 0.6],
                [0.6, 0.5, 0.4], [0.85, 0.75, 0.65], [0.5, 0.4, 0.3]
            ],
            'sketch': [
                [0.95, 0.95, 0.95], [0.05, 0.05, 0.05], [0.9, 0.9, 0.9],
                [0.1, 0.1, 0.1], [0.85, 0.85, 0.85], [0.15, 0.15, 0.15]
            ]
        }
        
        pattern = style_patterns.get(style_name, style_patterns['starry_night'])
        style_array = np.array([pattern for _ in range(64)], dtype=np.float32)
        style_array = style_array.reshape(1, 64, 6, 3)
        style_array = np.repeat(style_array, 11, axis=2)
        style_array = style_array[:, :, :64, :]
        
        return tf.convert_to_tensor(style_array)

    def stylize_frame(self, content_image_bytes: bytes, style_name: str = 'van_gogh') -> bytes:
        content_image = tf.image.decode_image(content_image_bytes, channels=3)
        content_image = tf.image.convert_image_dtype(content_image, tf.float32)
        content_image = content_image[tf.newaxis, ...]

        style_image = self.style_images.get(style_name, self.style_images['van_gogh'])
        style_image = tf.image.convert_image_dtype(style_image, tf.float32)

        outputs = self.hub_module(tf.constant(content_image), tf.constant(style_image))
        stylized_image = outputs[0]

        stylized_image = tf.squeeze(stylized_image)
        stylized_image = tf.clip_by_value(stylized_image, 0, 1)
        stylized_image = tf.image.convert_image_dtype(stylized_image, tf.uint8)

        output_bytes = io.BytesIO()
        Image.fromarray(stylized_image.numpy()).save(output_bytes, format='JPEG', quality=90)
        return output_bytes.getvalue()

    def stylize_frames_batch(self, frames_data: List[Dict], style_name: str) -> List[Dict]:
        results = []
        for frame_data in frames_data:
            try:
                stylized_bytes = self.stylize_frame(frame_data['image'], style_name)
                results.append({
                    'frame_index': frame_data['frame_index'],
                    'stylized_image': stylized_bytes
                })
            except Exception as e:
                print(f"Error processing frame {frame_data['frame_index']}: {e}")
                results.append({
                    'frame_index': frame_data['frame_index'],
                    'error': str(e)
                })
        return results

    def get_available_styles(self) -> List[str]:
        return list(self.style_images.keys())
