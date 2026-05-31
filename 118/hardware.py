import torch
import torch.nn as nn
import math
from typing import Dict, Tuple, Optional, List, NamedTuple


class HardwareProfile(NamedTuple):
    name: str
    description: str
    cpu_freq_ghz: float
    memory_bandwidth_gb_s: float
    cache_size_kb: int
    compute_density: float
    memory_bound_ratio: float
    parallel_efficiency: float
    vector_width: int


HARDWARE_PROFILES = {
    'raspberry_pi_4': HardwareProfile(
        name='raspberry_pi_4',
        description='Raspberry Pi 4 (ARM Cortex-A72 @ 1.5GHz, 1-4 cores)',
        cpu_freq_ghz=1.5,
        memory_bandwidth_gb_s=4.0,
        cache_size_kb=32,
        compute_density=0.8,
        memory_bound_ratio=0.7,
        parallel_efficiency=0.4,
        vector_width=4,
    ),
    'raspberry_pi_5': HardwareProfile(
        name='raspberry_pi_5',
        description='Raspberry Pi 5 (ARM Cortex-A76 @ 2.4GHz, 4 cores)',
        cpu_freq_ghz=2.4,
        memory_bandwidth_gb_s=8.0,
        cache_size_kb=512,
        compute_density=1.2,
        memory_bound_ratio=0.55,
        parallel_efficiency=0.6,
        vector_width=8,
    ),
    'mobile_cpu_mid': HardwareProfile(
        name='mobile_cpu_mid',
        description='Mid-range mobile CPU (ARM big.LITTLE, ~2.0GHz)',
        cpu_freq_ghz=2.0,
        memory_bandwidth_gb_s=12.0,
        cache_size_kb=256,
        compute_density=1.5,
        memory_bound_ratio=0.45,
        parallel_efficiency=0.55,
        vector_width=8,
    ),
    'mobile_cpu_flagship': HardwareProfile(
        name='mobile_cpu_flagship',
        description='Flagship mobile CPU (ARM Cortex-X1/A78, ~3.0GHz)',
        cpu_freq_ghz=3.0,
        memory_bandwidth_gb_s=18.0,
        cache_size_kb=1024,
        compute_density=2.0,
        memory_bound_ratio=0.35,
        parallel_efficiency=0.7,
        vector_width=16,
    ),
    'gpu_nvidia_1080ti': HardwareProfile(
        name='gpu_nvidia_1080ti',
        description='NVIDIA GTX 1080 Ti (Pascal, 3584 CUDA cores @ 1.58GHz)',
        cpu_freq_ghz=1.58,
        memory_bandwidth_gb_s=484.0,
        cache_size_kb=2816,
        compute_density=8.0,
        memory_bound_ratio=0.15,
        parallel_efficiency=0.85,
        vector_width=32,
    ),
    'gpu_nvidia_rtx3060': HardwareProfile(
        name='gpu_nvidia_rtx3060',
        description='NVIDIA RTX 3060 (Ampere, 3584 CUDA cores @ 1.78GHz)',
        cpu_freq_ghz=1.78,
        memory_bandwidth_gb_s=360.0,
        cache_size_kb=2304,
        compute_density=10.0,
        memory_bound_ratio=0.1,
        parallel_efficiency=0.88,
        vector_width=64,
    ),
    'gpu_nvidia_t4': HardwareProfile(
        name='gpu_nvidia_t4',
        description='NVIDIA T4 (Turing, 2560 CUDA cores @ 1.59GHz, inference-optimized)',
        cpu_freq_ghz=1.59,
        memory_bandwidth_gb_s=300.0,
        cache_size_kb=6400,
        compute_density=7.5,
        memory_bound_ratio=0.12,
        parallel_efficiency=0.82,
        vector_width=64,
    ),
    'edge_tpu': HardwareProfile(
        name='edge_tpu',
        description='Google Edge TPU (4 TOPS, inference accelerator)',
        cpu_freq_ghz=1.0,
        memory_bandwidth_gb_s=25.0,
        cache_size_kb=8192,
        compute_density=15.0,
        memory_bound_ratio=0.2,
        parallel_efficiency=0.75,
        vector_width=128,
    ),
}


class HardwareLatencyEstimator:
    def __init__(self, hardware_name: str = 'raspberry_pi_4'):
        if hardware_name not in HARDWARE_PROFILES:
            raise ValueError(
                f"Unknown hardware: {hardware_name}. "
                f"Available: {list(HARDWARE_PROFILES.keys())}"
            )
        self.profile = HARDWARE_PROFILES[hardware_name]
        self.hardware_name = hardware_name

    def _estimate_conv2d_latency(self, conv: nn.Conv2d, input_h: int, input_w: int,
                                  batch_size: int = 1) -> float:
        out_channels = conv.out_channels
        in_channels = conv.in_channels
        kernel_h, kernel_w = conv.kernel_size
        stride_h, stride_w = conv.stride
        padding_h, padding_w = conv.padding
        groups = conv.groups

        output_h = (input_h + 2 * padding_h - kernel_h) // stride_h + 1
        output_w = (input_w + 2 * padding_w - kernel_w) // stride_w + 1

        if output_h <= 0 or output_w <= 0:
            return 0.0

        ops_per_output = in_channels * kernel_h * kernel_w * 2
        if conv.bias is not None:
            ops_per_output += 1
        if groups > 1:
            ops_per_output = ops_per_output // groups

        total_ops = batch_size * ops_per_output * out_channels * output_h * output_w

        memory_read = batch_size * in_channels * input_h * input_w * 4
        memory_write = batch_size * out_channels * output_h * output_w * 4

        return self._estimate_layer_latency(total_ops, memory_read + memory_write)

    def _estimate_depthwise_conv2d_latency(self, conv: nn.Conv2d, input_h: int,
                                            input_w: int, batch_size: int = 1) -> float:
        out_channels = conv.out_channels
        kernel_h, kernel_w = conv.kernel_size
        stride_h, stride_w = conv.stride
        padding_h, padding_w = conv.padding

        output_h = (input_h + 2 * padding_h - kernel_h) // stride_h + 1
        output_w = (input_w + 2 * padding_w - kernel_w) // stride_w + 1

        if output_h <= 0 or output_w <= 0:
            return 0.0

        total_ops = batch_size * out_channels * output_h * output_w * kernel_h * kernel_w * 2
        memory_read = batch_size * out_channels * input_h * input_w * 4
        memory_write = batch_size * out_channels * output_h * output_w * 4

        return self._estimate_layer_latency(total_ops, memory_read + memory_write)

    def _estimate_pointwise_conv2d_latency(self, conv: nn.Conv2d, input_h: int,
                                            input_w: int, batch_size: int = 1) -> float:
        out_channels = conv.out_channels
        in_channels = conv.in_channels

        output_h = input_h
        output_w = input_w

        total_ops = batch_size * in_channels * out_channels * output_h * output_w * 2
        if conv.bias is not None:
            total_ops += batch_size * out_channels * output_h * output_w

        memory_read = batch_size * in_channels * input_h * input_w * 4
        memory_write = batch_size * out_channels * output_h * output_w * 4

        return self._estimate_layer_latency(total_ops, memory_read + memory_write)

    def _estimate_linear_latency(self, linear: nn.Linear, batch_size: int = 1) -> float:
        total_ops = batch_size * linear.in_features * linear.out_features * 2
        if linear.bias is not None:
            total_ops += batch_size * linear.out_features

        memory_read = batch_size * linear.in_features * 4
        memory_write = batch_size * linear.out_features * 4

        return self._estimate_layer_latency(total_ops, memory_read + memory_write)

    def _estimate_bn2d_latency(self, bn: nn.BatchNorm2d, input_h: int, input_w: int,
                                batch_size: int = 1) -> float:
        total_ops = batch_size * bn.num_features * input_h * input_w * 4
        memory_read = batch_size * bn.num_features * input_h * input_w * 4
        memory_write = batch_size * bn.num_features * input_h * input_w * 4

        return self._estimate_layer_latency(total_ops, memory_read + memory_write)

    def _estimate_relu_latency(self, num_elements: int, batch_size: int = 1) -> float:
        total_ops = batch_size * num_elements
        memory_access = batch_size * num_elements * 4
        return self._estimate_layer_latency(total_ops, memory_access)

    def _estimate_pool_latency(self, num_elements: int, batch_size: int = 1) -> float:
        total_ops = batch_size * num_elements
        memory_access = batch_size * num_elements * 4
        return self._estimate_layer_latency(total_ops, memory_access)

    def _estimate_layer_latency(self, total_ops: int, memory_bytes: int) -> float:
        p = self.profile

        compute_time = total_ops / (p.cpu_freq_ghz * 1e9 * p.compute_density * p.parallel_efficiency)
        memory_time = memory_bytes / (p.memory_bandwidth_gb_s * 1e9)
        memory_time *= p.memory_bound_ratio

        vector_overhead = 1.0 + (1.0 / p.vector_width) * 0.1

        latency = max(compute_time, memory_time) * vector_overhead
        return latency

    def estimate_model_latency(self, model: nn.Module,
                                input_shape: Tuple[int, ...] = (1, 3, 224, 224)) -> Dict:
        batch_size = input_shape[0]
        input_c = input_shape[1]
        input_h = input_shape[2]
        input_w = input_shape[3]

        activations = {'h': input_h, 'w': input_w, 'c': input_c}
        layer_latencies = {}
        total_latency = 0.0

        for name, module in model.named_modules():
            if isinstance(module, nn.Conv2d):
                h, w = activations['h'], activations['w']

                if module.groups == module.in_channels == module.out_channels:
                    latency = self._estimate_depthwise_conv2d_latency(module, h, w, batch_size)
                elif module.kernel_size == (1, 1):
                    latency = self._estimate_pointwise_conv2d_latency(module, h, w, batch_size)
                else:
                    latency = self._estimate_conv2d_latency(module, h, w, batch_size)

                if module.stride[0] > 1 or module.stride[1] > 1:
                    new_h = (h + 2 * module.padding[0] - module.kernel_size[0]) // module.stride[0] + 1
                    new_w = (w + 2 * module.padding[1] - module.kernel_size[1]) // module.stride[1] + 1
                    activations['h'] = max(new_h, 1)
                    activations['w'] = max(new_w, 1)

                activations['c'] = module.out_channels
                layer_latencies[name] = {
                    'type': 'Conv2d',
                    'latency_ms': latency * 1000,
                    'ops': module.out_channels * module.in_channels * module.kernel_size[0] * module.kernel_size[1],
                }
                total_latency += latency

            elif isinstance(module, nn.BatchNorm2d):
                h, w = activations['h'], activations['w']
                latency = self._estimate_bn2d_latency(module, h, w, batch_size)
                layer_latencies[name] = {
                    'type': 'BatchNorm2d',
                    'latency_ms': latency * 1000,
                }
                total_latency += latency

            elif isinstance(module, nn.ReLU) or isinstance(module, nn.ReLU6):
                num_elements = batch_size * activations['c'] * activations['h'] * activations['w']
                latency = self._estimate_relu_latency(num_elements, batch_size)
                layer_latencies[name] = {
                    'type': 'ReLU',
                    'latency_ms': latency * 1000,
                }
                total_latency += latency

            elif isinstance(module, (nn.MaxPool2d, nn.AvgPool2d)):
                if isinstance(module.kernel_size, tuple):
                    kh, kw = module.kernel_size
                else:
                    kh = kw = module.kernel_size
                if isinstance(module.stride, tuple):
                    sh, sw = module.stride
                else:
                    sh = sw = module.stride

                num_elements = batch_size * activations['c'] * activations['h'] * activations['w']
                latency = self._estimate_pool_latency(num_elements, batch_size)

                new_h = (activations['h'] - kh) // sh + 1 if sh > 0 else activations['h']
                new_w = (activations['w'] - kw) // sw + 1 if sw > 0 else activations['w']
                activations['h'] = max(new_h, 1)
                activations['w'] = max(new_w, 1)

                layer_latencies[name] = {
                    'type': 'Pool',
                    'latency_ms': latency * 1000,
                }
                total_latency += latency

            elif isinstance(module, nn.AdaptiveAvgPool2d):
                if isinstance(module.output_size, tuple):
                    new_h, new_w = module.output_size
                else:
                    new_h = new_w = module.output_size
                activations['h'] = new_h
                activations['w'] = new_w

                num_elements = batch_size * activations['c'] * activations['h'] * activations['w']
                latency = self._estimate_pool_latency(num_elements, batch_size)
                layer_latencies[name] = {
                    'type': 'AdaptivePool',
                    'latency_ms': latency * 1000,
                }
                total_latency += latency

            elif isinstance(module, nn.Linear):
                latency = self._estimate_linear_latency(module, batch_size)
                layer_latencies[name] = {
                    'type': 'Linear',
                    'latency_ms': latency * 1000,
                }
                total_latency += latency

        return {
            'hardware': self.hardware_name,
            'hardware_description': self.profile.description,
            'total_latency_ms': total_latency * 1000,
            'total_latency_s': total_latency,
            'layer_latencies': layer_latencies,
            'estimated_fps': 1.0 / max(total_latency, 1e-10),
        }

    def estimate_layer_latency_impact(self, conv: nn.Conv2d, input_h: int, input_w: int,
                                       prune_ratio: float, batch_size: int = 1) -> Dict:
        original_out = conv.out_channels
        pruned_out = max(1, int(original_out * (1 - prune_ratio)))

        if conv.groups == conv.in_channels == original_out:
            latency_before = self._estimate_depthwise_conv2d_latency(conv, input_h, input_w, batch_size)
        elif conv.kernel_size == (1, 1):
            latency_before = self._estimate_pointwise_conv2d_latency(conv, input_h, input_w, batch_size)
        else:
            latency_before = self._estimate_conv2d_latency(conv, input_h, input_w, batch_size)

        saved_out = original_out - pruned_out
        latency_saved = latency_before * (saved_out / original_out) * self.profile.parallel_efficiency
        latency_after = latency_before - latency_saved

        return {
            'original_latency_ms': latency_before * 1000,
            'pruned_latency_ms': max(latency_after, 0) * 1000,
            'latency_saved_ms': latency_saved * 1000,
            'latency_reduction_ratio': latency_saved / max(latency_before, 1e-10),
            'original_channels': original_out,
            'pruned_channels': pruned_out,
        }


def get_available_hardware() -> List[str]:
    return list(HARDWARE_PROFILES.keys())


def get_hardware_description(hardware_name: str) -> str:
    if hardware_name not in HARDWARE_PROFILES:
        return f"Unknown hardware: {hardware_name}"
    p = HARDWARE_PROFILES[hardware_name]
    return f"{p.description} | Freq: {p.cpu_freq_ghz}GHz | BW: {p.memory_bandwidth_gb_s}GB/s | Cache: {p.cache_size_kb}KB"
