import numpy as np
import tensorflow as tf
from PIL import Image
import io
import os
from typing import List, Dict, Tuple
import time


class RIFEInterpolator:
    def __init__(self, model_path: str = None):
        self.model = None
        self.model_path = model_path
        self.initialized = False
        self.use_simplified = True
        
        try:
            self._load_model()
        except Exception as e:
            print(f"Warning: Could not load RIFE model: {e}")
            print("Using simplified interpolation method")
            self.use_simplified = True

    def _load_model(self):
        if self.model_path and os.path.exists(self.model_path):
            self.model = tf.saved_model.load(self.model_path)
            self.initialized = True
            self.use_simplified = False
            print("RIFE model loaded successfully")
        else:
            self.use_simplified = True
            self.initialized = True
            print("Using simplified frame interpolation (no model required)")

    def interpolate_frames(
        self,
        frame1_bytes: bytes,
        frame2_bytes: bytes,
        num_intermediate: int = 2,
        target_fps: int = 60
    ) -> List[bytes]:
        if self.use_simplified:
            return self._simplified_interpolate(frame1_bytes, frame2_bytes, num_intermediate)
        else:
            return self._rife_interpolate(frame1_bytes, frame2_bytes, num_intermediate)

    def _simplified_interpolate(
        self,
        frame1_bytes: bytes,
        frame2_bytes: bytes,
        num_intermediate: int
    ) -> List[bytes]:
        img1 = self._load_image(frame1_bytes)
        img2 = self._load_image(frame2_bytes)
        
        if img1.shape != img2.shape:
            img2 = tf.image.resize(img2, (img1.shape[0], img1.shape[1]))
        
        interpolated_frames = []
        
        for i in range(1, num_intermediate + 1):
            alpha = i / (num_intermediate + 1)
            
            frame = self._adaptive_interpolation(img1, img2, alpha)
            
            img_byte_arr = io.BytesIO()
            Image.fromarray(frame.numpy().astype(np.uint8)).save(img_byte_arr, format='JPEG', quality=90)
            interpolated_frames.append(img_byte_arr.getvalue())
        
        return interpolated_frames

    def _adaptive_interpolation(self, img1, img2, alpha):
        h, w, c = img1.shape
        
        diff = tf.abs(tf.cast(img1, tf.float32) - tf.cast(img2, tf.float32))
        motion_mask = tf.reduce_mean(diff, axis=-1) > 20
        
        flow_x, flow_y = self._estimate_optical_flow(img1, img2)
        
        grid_x, grid_y = tf.meshgrid(tf.range(w), tf.range(h))
        grid_x = tf.cast(grid_x, tf.float32)
        grid_y = tf.cast(grid_y, tf.float32)
        
        sample_x = tf.clip_by_value(grid_x + flow_x * alpha, 0, w - 1)
        sample_y = tf.clip_by_value(grid_y + flow_y * alpha, 0, h - 1)
        
        warped1 = self._bilinear_sampler(img1, sample_x, sample_y)
        warped2 = self._bilinear_sampler(img2, -flow_x * (1 - alpha), -flow_y * (1 - alpha))
        
        blended = warped1 * (1 - alpha) + warped2 * alpha
        
        blurred = self._gaussian_blend(img1, img2, alpha)
        
        motion_mask_3d = tf.expand_dims(motion_mask, axis=-1)
        result = tf.where(motion_mask_3d, blended, blurred)
        
        return tf.clip_by_value(result, 0, 255)

    def _estimate_optical_flow(self, img1, img2):
        img1_gray = tf.reduce_mean(tf.cast(img1, tf.float32), axis=-1)
        img2_gray = tf.reduce_mean(tf.cast(img2, tf.float32), axis=-1)
        
        gx = tf.image.sobel_edges(tf.expand_dims(tf.expand_dims(img1_gray, axis=0), axis=-1))
        gy = tf.image.sobel_edges(tf.expand_dims(tf.expand_dims(img1_gray, axis=0), axis=-1))
        
        gx = tf.squeeze(gx[..., 0])
        gy = tf.squeeze(gy[..., 1])
        
        gt = img2_gray - img1_gray
        
        flow_x = -gt * gx / (gx * gx + gy * gy + 1e-6)
        flow_y = -gt * gy / (gx * gx + gy * gy + 1e-6)
        
        flow_x = tf.clip_by_value(flow_x, -10, 10)
        flow_y = tf.clip_by_value(flow_y, -10, 10)
        
        return flow_x, flow_y

    def _bilinear_sampler(self, img, x, y):
        x0 = tf.floor(x)
        x1 = x0 + 1
        y0 = tf.floor(y)
        y1 = y0 + 1
        
        x0 = tf.clip_by_value(tf.cast(x0, tf.int32), 0, img.shape[1] - 1)
        x1 = tf.clip_by_value(tf.cast(x1, tf.int32), 0, img.shape[1] - 1)
        y0 = tf.clip_by_value(tf.cast(y0, tf.int32), 0, img.shape[0] - 1)
        y1 = tf.clip_by_value(tf.cast(y1, tf.int32), 0, img.shape[0] - 1)
        
        fx = x - tf.cast(x0, tf.float32)
        fy = y - tf.cast(y0, tf.float32)
        
        fx = tf.expand_dims(fx, axis=-1)
        fy = tf.expand_dims(fy, axis=-1)
        
        Ia = tf.gather_nd(img, tf.stack([y0, x0], axis=-1))
        Ib = tf.gather_nd(img, tf.stack([y0, x1], axis=-1))
        Ic = tf.gather_nd(img, tf.stack([y1, x0], axis=-1))
        Id = tf.gather_nd(img, tf.stack([y1, x1], axis=-1))
        
        wa = (1 - fx) * (1 - fy)
        wb = fx * (1 - fy)
        wc = (1 - fx) * fy
        wd = fx * fy
        
        return Ia * wa + Ib * wb + Ic * wc + Id * wd

    def _gaussian_blend(self, img1, img2, alpha):
        kernel_size = 5
        sigma = 1.0
        
        x = tf.range(-kernel_size // 2 + 1, kernel_size // 2 + 1, dtype=tf.float32)
        g = tf.exp(-x ** 2 / (2 * sigma ** 2))
        kernel = tf.reshape(g, (-1, 1)) * tf.reshape(g, (1, -1))
        kernel = kernel / tf.reduce_sum(kernel)
        kernel = tf.expand_dims(tf.expand_dims(kernel, axis=-1), axis=-1)
        kernel = tf.tile(kernel, [1, 1, 3, 1])
        
        img1_float = tf.expand_dims(tf.cast(img1, tf.float32), axis=0)
        img2_float = tf.expand_dims(tf.cast(img2, tf.float32), axis=0)
        
        blurred1 = tf.nn.depthwise_conv2d(img1_float, kernel, [1, 1, 1, 1], 'SAME')
        blurred2 = tf.nn.depthwise_conv2d(img2_float, kernel, [1, 1, 1, 1], 'SAME')
        
        blended = tf.squeeze(blurred1 * (1 - alpha) + blurred2 * alpha)
        return blended

    def _rife_interpolate(
        self,
        frame1_bytes: bytes,
        frame2_bytes: bytes,
        num_intermediate: int
    ) -> List[bytes]:
        img1 = self._load_image(frame1_bytes)
        img2 = self._load_image(frame2_bytes)
        
        img1_tensor = tf.cast(img1, tf.float32) / 255.0
        img2_tensor = tf.cast(img2, tf.float32) / 255.0
        
        img1_tensor = tf.expand_dims(img1_tensor, axis=0)
        img2_tensor = tf.expand_dims(img2_tensor, axis=0)
        
        interpolated_frames = []
        
        for i in range(1, num_intermediate + 1):
            alpha = i / (num_intermediate + 1)
            
            result = self.model(img1_tensor, img2_tensor, [alpha])
            result = tf.squeeze(result)
            result = tf.clip_by_value(result * 255, 0, 255)
            result = tf.cast(result, tf.uint8)
            
            img_byte_arr = io.BytesIO()
            Image.fromarray(result.numpy()).save(img_byte_arr, format='JPEG', quality=90)
            interpolated_frames.append(img_byte_arr.getvalue())
        
        return interpolated_frames

    def interpolate_sequence(
        self,
        frames: List[Dict[str, Any]],
        source_fps: float,
        target_fps: float,
        on_progress=None
    ) -> List[Dict[str, Any]]:
        if len(frames) < 2:
            return frames
        
        frame_duration = 1.0 / source_fps
        target_frame_duration = 1.0 / target_fps
        interpolation_factor = target_fps / source_fps
        
        total_output_frames = int(len(frames) * interpolation_factor)
        print(f"Interpolating {len(frames)} frames @ {source_fps}fps -> {total_output_frames} frames @ {target_fps}fps")
        
        output_frames = []
        
        for i in range(len(frames) - 1):
            frame1 = frames[i]
            frame2 = frames[i + 1]
            
            output_frames.append({
                **frame1,
                'timestamp': i * frame_duration,
                'original_index': i,
                'is_interpolated': False
            })
            
            num_intermediate = int(interpolation_factor) - 1
            
            if num_intermediate > 0:
                interpolated = self.interpolate_frames(
                    frame1['image'],
                    frame2['image'],
                    num_intermediate=num_intermediate,
                    target_fps=target_fps
                )
                
                for j, interp_frame in enumerate(interpolated):
                    interp_timestamp = i * frame_duration + (j + 1) * target_frame_duration
                    output_frames.append({
                        'index': len(output_frames),
                        'timestamp': interp_timestamp,
                        'image': interp_frame,
                        'original_index': i,
                        'is_interpolated': True,
                        'interpolation_between': [i, i + 1],
                        'interpolation_alpha': (j + 1) / (num_intermediate + 1)
                    })
            
            if on_progress:
                on_progress(i + 1, len(frames) - 1)
        
        output_frames.append({
            **frames[-1],
            'timestamp': (len(frames) - 1) * frame_duration,
            'original_index': len(frames) - 1,
            'is_interpolated': False
        })
        
        return output_frames

    def _load_image(self, image_bytes: bytes) -> tf.Tensor:
        if isinstance(image_bytes, str) and image_bytes.startswith('data:image'):
            image_bytes = base64.b64decode(image_bytes.split(',')[1])
        
        img = tf.image.decode_image(image_bytes, channels=3)
        img = tf.image.convert_image_dtype(img, tf.uint8)
        return img

    def get_interpolation_info(self, source_fps: float, target_fps: float) -> Dict[str, Any]:
        factor = target_fps / source_fps
        num_intermediate = int(factor) - 1
        
        return {
            'source_fps': source_fps,
            'target_fps': target_fps,
            'interpolation_factor': factor,
            'num_intermediate_frames': num_intermediate,
            'output_duration_multiplier': 1.0,
            'uses_rife_model': not self.use_simplified
        }
