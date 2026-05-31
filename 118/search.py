import torch
import torch.nn as nn
import copy
from typing import Dict, List, Tuple, Optional
from pruner import Pruner
from flops import compute_flops
from hardware import HardwareLatencyEstimator


class PruningSearcher:
    MIN_CHANNELS = 1

    def __init__(self, model: nn.Module, device: Optional[torch.device] = None,
                 input_shape: Tuple[int, ...] = (1, 3, 224, 224),
                 hardware_name: Optional[str] = None):
        self.model = model
        self.device = device or torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.input_shape = input_shape
        self._original_flops = None
        self._original_latency_ms = None
        self.hardware_name = hardware_name
        self.latency_estimator = None
        if hardware_name is not None:
            self.latency_estimator = HardwareLatencyEstimator(hardware_name)

    def _get_original_flops(self) -> int:
        if self._original_flops is None:
            result = compute_flops(self.model, self.input_shape, self.device)
            self._original_flops = result['total_flops']
        return self._original_flops

    def _get_original_latency_ms(self) -> float:
        if self._original_latency_ms is None and self.latency_estimator is not None:
            result = self.latency_estimator.estimate_model_latency(self.model, self.input_shape)
            self._original_latency_ms = result['total_latency_ms']
        return self._original_latency_ms or 0.0

    def _get_prunable_layers(self) -> List[Tuple[str, nn.Conv2d]]:
        layers = []
        for name, module in self.model.named_modules():
            if isinstance(module, nn.Conv2d) and module.groups == 1 and module.out_channels > self.MIN_CHANNELS:
                layers.append((name, module))
        return layers

    def _get_max_safe_ratio(self, num_channels: int) -> float:
        max_prunable = num_channels - self.MIN_CHANNELS
        if max_prunable <= 0:
            return 0.0
        return max_prunable / num_channels

    def _clamp_ratio(self, ratio: float, num_channels: int) -> float:
        max_ratio = self._get_max_safe_ratio(num_channels)
        return max(0.0, min(ratio, max_ratio))

    def _evaluate_layer_importance(self, layer_name: str, conv: nn.Conv2d,
                                    method: str = 'l1',
                                    importance_scores: Optional[Dict[str, torch.Tensor]] = None) -> torch.Tensor:
        if method == 'l1':
            weight = conv.weight.data
            return weight.abs().sum(dim=(1, 2, 3))
        elif method == 'gradient':
            if importance_scores and layer_name in importance_scores:
                return importance_scores[layer_name]
            weight = conv.weight.data
            return weight.abs().sum(dim=(1, 2, 3))
        else:
            raise ValueError(f"Unknown method: {method}")

    def _safe_prune_and_compute(self, ratios: Dict[str, float],
                                 method: str,
                                 importance_scores: Optional[Dict[str, torch.Tensor]]) -> Optional[Dict]:
        try:
            pruner = Pruner(copy.deepcopy(self.model), self.device)
            pruner.prune_model(ratios, method, importance_scores)
            pruner.fix_zero_channel_layers()
            if not pruner.validate_model(self.input_shape):
                return None

            flops = compute_flops(pruner.model, self.input_shape, self.device)['total_flops']

            latency_ms = None
            if self.latency_estimator is not None:
                lat_result = self.latency_estimator.estimate_model_latency(
                    pruner.model, self.input_shape
                )
                latency_ms = lat_result['total_latency_ms']

            return {'flops': flops, 'latency_ms': latency_ms, 'pruner': pruner}
        except Exception:
            return None

    def _get_target_metric(self, target_flops_ratio: float,
                            target_latency_ratio: Optional[float]) -> Dict:
        if target_latency_ratio is not None and self.latency_estimator is not None:
            return {
                'type': 'latency',
                'target': self._get_original_latency_ms() * target_latency_ratio,
                'original': self._get_original_latency_ms(),
            }
        else:
            return {
                'type': 'flops',
                'target': self._get_original_flops() * target_flops_ratio,
                'original': self._get_original_flops(),
            }

    def _get_metric_value(self, result: Dict) -> float:
        if result.get('latency_ms') is not None:
            return result['latency_ms']
        return result['flops']

    def search_uniform(self, target_flops_ratio: float = 0.5, method: str = 'l1',
                       importance_scores: Optional[Dict[str, torch.Tensor]] = None,
                       target_latency_ratio: Optional[float] = None) -> Dict[str, float]:
        prunable_layers = self._get_prunable_layers()
        target_info = self._get_target_metric(target_flops_ratio, target_latency_ratio)

        best_ratios = {}
        best_metric = float('inf')
        low, high = 0.0, 0.9
        tolerance = 0.02

        min_channels = min(conv.out_channels for _, conv in prunable_layers)
        max_uniform_ratio = self._get_max_safe_ratio(min_channels)

        for _ in range(20):
            mid = (low + high) / 2
            mid = min(mid, max_uniform_ratio)
            ratios = {name: mid for name, _ in prunable_layers}

            result = self._safe_prune_and_compute(ratios, method, importance_scores)
            if result is None:
                high = mid
                continue

            current_metric = self._get_metric_value(result)
            target_value = target_info['target']

            if abs(current_metric - target_value) < abs(best_metric - target_value):
                best_metric = current_metric
                best_ratios = ratios

            if current_metric > target_value:
                low = mid
            else:
                high = mid

            if abs(current_metric - target_value) / max(target_value, 1e-10) < tolerance:
                break

        return best_ratios

    def search_layer_wise(self, target_flops_ratio: float = 0.5, method: str = 'l1',
                           importance_scores: Optional[Dict[str, torch.Tensor]] = None,
                           max_iterations: int = 50,
                           target_latency_ratio: Optional[float] = None) -> Dict[str, float]:
        prunable_layers = self._get_prunable_layers()
        target_info = self._get_target_metric(target_flops_ratio, target_latency_ratio)

        layer_importance = {}
        for name, conv in prunable_layers:
            importance = self._evaluate_layer_importance(name, conv, method, importance_scores)
            layer_importance[name] = importance.mean().item()

        importance_values = list(layer_importance.values())
        min_imp = min(importance_values)
        max_imp = max(importance_values)

        if max_imp == min_imp:
            normalized = {k: 1.0 for k in layer_importance}
        else:
            normalized = {k: (v - min_imp) / (max_imp - min_imp) for k, v in layer_importance.items()}

        layer_max_ratio = {}
        for name, conv in prunable_layers:
            layer_max_ratio[name] = self._get_max_safe_ratio(conv.out_channels)

        layer_latency_sensitivity = {}
        if self.latency_estimator is not None:
            input_h, input_w = self.input_shape[2], self.input_shape[3]
            for name, conv in prunable_layers:
                impact = self.latency_estimator.estimate_layer_latency_impact(
                    conv, input_h, input_w, 0.5
                )
                layer_latency_sensitivity[name] = impact['latency_reduction_ratio']

        best_ratios = {}
        best_metric = float('inf')

        for scale in [0.3, 0.5, 0.7, 0.8, 0.9, 1.0]:
            ratios = {}
            for name, conv in prunable_layers:
                imp = normalized[name]
                base_ratio = (1.0 - imp) * scale

                if name in layer_latency_sensitivity:
                    sens = layer_latency_sensitivity[name]
                    base_ratio = base_ratio * (0.5 + sens)

                ratios[name] = self._clamp_ratio(base_ratio, conv.out_channels)

            result = self._safe_prune_and_compute(ratios, method, importance_scores)
            if result is None:
                continue

            current_metric = self._get_metric_value(result)
            target_value = target_info['target']

            if abs(current_metric - target_value) < abs(best_metric - target_value):
                best_metric = current_metric
                best_ratios = ratios

        if best_ratios and best_metric > target_info['target']:
            for name, conv in prunable_layers:
                best_ratios[name] = self._clamp_ratio(best_ratios[name] * 1.2, conv.out_channels)

        return best_ratios

    def search_greedy(self, target_flops_ratio: float = 0.5, method: str = 'l1',
                       importance_scores: Optional[Dict[str, torch.Tensor]] = None,
                       target_latency_ratio: Optional[float] = None) -> Dict[str, float]:
        prunable_layers = self._get_prunable_layers()
        target_info = self._get_target_metric(target_flops_ratio, target_latency_ratio)

        metric_original = target_info['original']
        metric_target = target_info['target']

        layer_flops = {}
        for name, conv in prunable_layers:
            weight = conv.weight.data
            out_c, in_c, kh, kw = weight.shape
            flops = out_c * in_c * kh * kw
            layer_flops[name] = flops

        layer_importance = {}
        for name, conv in prunable_layers:
            importance = self._evaluate_layer_importance(name, conv, method, importance_scores)
            layer_importance[name] = importance.cpu()

        ratios = {name: 0.0 for name, _ in prunable_layers}
        current_metric = metric_original

        while current_metric > metric_target:
            best_layer = None
            best_score = -float('inf')

            for name, conv in prunable_layers:
                max_ratio = self._get_max_safe_ratio(conv.out_channels)
                if ratios[name] >= max_ratio:
                    continue

                current_keep = conv.out_channels - int(conv.out_channels * ratios[name])
                if current_keep <= self.MIN_CHANNELS:
                    continue

                importance = layer_importance[name]
                _, sorted_idx = importance.sort()

                new_pruned = max(1, int(conv.out_channels * 0.05))
                new_keep = current_keep - new_pruned
                if new_keep < self.MIN_CHANNELS:
                    continue

                importance_sum = importance[sorted_idx[:new_keep]].sum().item()

                if self.latency_estimator is not None:
                    input_h, input_w = self.input_shape[2], self.input_shape[3]
                    impact = self.latency_estimator.estimate_layer_latency_impact(
                        conv, input_h, input_w, ratios[name] + 0.05
                    )
                    metric_saved = impact['latency_saved_ms']
                else:
                    metric_saved = layer_flops[name] * (new_pruned / conv.out_channels)

                score = metric_saved / (importance_sum + 1e-10)

                if score > best_score:
                    best_score = score
                    best_layer = name

            if best_layer is None:
                break

            ratios[best_layer] = min(
                ratios[best_layer] + 0.05,
                self._get_max_safe_ratio(dict(prunable_layers)[best_layer].out_channels)
            )

            result = self._safe_prune_and_compute(ratios, method, importance_scores)
            if result is not None:
                current_metric = self._get_metric_value(result)
            else:
                ratios[best_layer] -= 0.05
                break

        return ratios

    def search(self, strategy: str = 'layer_wise', target_flops_ratio: float = 0.5,
               method: str = 'l1',
               importance_scores: Optional[Dict[str, torch.Tensor]] = None,
               target_latency_ratio: Optional[float] = None) -> Dict[str, float]:
        if strategy == 'uniform':
            return self.search_uniform(target_flops_ratio, method, importance_scores,
                                        target_latency_ratio)
        elif strategy == 'layer_wise':
            return self.search_layer_wise(target_flops_ratio, method, importance_scores,
                                           target_latency_ratio=target_latency_ratio)
        elif strategy == 'greedy':
            return self.search_greedy(target_flops_ratio, method, importance_scores,
                                       target_latency_ratio)
        else:
            raise ValueError(f"Unknown strategy: {strategy}. Use 'uniform', 'layer_wise', or 'greedy'.")

    def estimate_hardware_improvement(self, pruned_model: nn.Module) -> Dict:
        if self.latency_estimator is None:
            return {'hardware': None}

        original_lat = self._get_original_latency_ms()
        pruned_result = self.latency_estimator.estimate_model_latency(pruned_model, self.input_shape)
        pruned_lat = pruned_result['total_latency_ms']

        return {
            'hardware': self.hardware_name,
            'original_latency_ms': original_lat,
            'pruned_latency_ms': pruned_lat,
            'latency_reduction_ms': original_lat - pruned_lat,
            'latency_reduction_pct': (1 - pruned_lat / max(original_lat, 1e-10)) * 100,
            'original_estimated_fps': 1000.0 / max(original_lat, 1e-10),
            'pruned_estimated_fps': 1000.0 / max(pruned_lat, 1e-10),
            'speedup': original_lat / max(pruned_lat, 1e-10),
        }
