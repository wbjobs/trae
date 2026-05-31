import torch
import torch.nn as nn
import copy
from typing import Dict, List, Tuple, Optional


class Pruner:
    MIN_CHANNELS = 1

    def __init__(self, model: nn.Module, device: Optional[torch.device] = None):
        self.model = model
        self.device = device or torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.original_state = copy.deepcopy(model.state_dict())
        self._pruning_records = {}
        self._original_shapes = {}
        for name, module in self.model.named_modules():
            if isinstance(module, nn.Conv2d):
                self._original_shapes[name] = {
                    'in_channels': module.in_channels,
                    'out_channels': module.out_channels,
                    'groups': module.groups,
                }
            elif isinstance(module, nn.BatchNorm2d):
                self._original_shapes[name] = {
                    'num_features': module.num_features,
                }

    def _get_conv_layers(self) -> List[Tuple[str, nn.Conv2d]]:
        layers = []
        for name, module in self.model.named_modules():
            if isinstance(module, nn.Conv2d) and module.groups == 1:
                layers.append((name, module))
        return layers

    def _get_depthwise_conv_layers(self) -> List[Tuple[str, nn.Conv2d]]:
        layers = []
        for name, module in self.model.named_modules():
            if isinstance(module, nn.Conv2d) and module.groups > 1:
                layers.append((name, module))
        return layers

    def _compute_l1_importance(self, conv: nn.Conv2d) -> torch.Tensor:
        weight = conv.weight.data
        importance = weight.abs().sum(dim=(1, 2, 3))
        return importance

    def _compute_gradient_importance(self, importance_scores: Dict[str, torch.Tensor],
                                      layer_name: str, conv: nn.Conv2d) -> torch.Tensor:
        if layer_name in importance_scores:
            return importance_scores[layer_name]
        return self._compute_l1_importance(conv)

    def get_layer_importance(self, layer_name: str, conv: nn.Conv2d,
                              method: str = 'l1',
                              importance_scores: Optional[Dict[str, torch.Tensor]] = None) -> torch.Tensor:
        if method == 'l1':
            return self._compute_l1_importance(conv)
        elif method == 'gradient':
            return self._compute_gradient_importance(importance_scores or {}, layer_name, conv)
        else:
            raise ValueError(f"Unknown method: {method}. Use 'l1' or 'gradient'.")

    def compute_gradient_sensitivity(self, train_loader, criterion, num_batches: int = 10) -> Dict[str, torch.Tensor]:
        self.model.train()
        importance_scores = {}

        for name, module in self.model.named_modules():
            if isinstance(module, nn.Conv2d):
                importance_scores[name] = torch.zeros(module.out_channels, device=self.device)

        total_batches = min(num_batches, len(train_loader))
        data_iter = iter(train_loader)

        for batch_idx in range(total_batches):
            try:
                inputs, targets = next(data_iter)
            except StopIteration:
                data_iter = iter(train_loader)
                inputs, targets = next(data_iter)

            inputs = inputs.to(self.device)
            targets = targets.to(self.device)

            self.model.zero_grad()
            outputs = self.model(inputs)
            loss = criterion(outputs, targets)
            loss.backward()

            for name, module in self.model.named_modules():
                if isinstance(module, nn.Conv2d) and module.weight.grad is not None:
                    grad = module.weight.grad.data
                    channel_grad_norm = grad.abs().sum(dim=(1, 2, 3))
                    importance_scores[name] += channel_grad_norm

            self.model.zero_grad()

        for name in importance_scores:
            importance_scores[name] /= total_batches

        return importance_scores

    def prune_layer(self, layer_name: str, conv: nn.Conv2d, prune_ratio: float,
                     method: str = 'l1',
                     importance_scores: Optional[Dict[str, torch.Tensor]] = None) -> int:
        if prune_ratio <= 0 or prune_ratio >= 1:
            return 0

        num_channels = conv.out_channels
        if num_channels <= self.MIN_CHANNELS:
            return 0

        num_prune = int(num_channels * prune_ratio)
        num_keep = num_channels - num_prune

        if num_keep < self.MIN_CHANNELS:
            num_keep = self.MIN_CHANNELS
            num_prune = num_channels - num_keep

        if num_prune <= 0:
            return 0

        importance = self.get_layer_importance(layer_name, conv, method, importance_scores)
        _, keep_indices = torch.topk(importance, num_keep, largest=True)
        keep_indices = keep_indices.sort()[0]

        if len(keep_indices) < self.MIN_CHANNELS:
            return 0

        self._pruning_records[layer_name] = {
            'pruned_count': num_prune,
            'original_channels': num_channels,
            'keep_indices': keep_indices.cpu(),
            'prune_ratio': prune_ratio,
            'new_out_channels': num_keep,
        }

        conv.weight.data = conv.weight.data[keep_indices]
        if conv.bias is not None:
            conv.bias.data = conv.bias.data[keep_indices]
        conv.out_channels = num_keep

        return num_prune

    def prune_layer_input(self, layer_name: str, conv: nn.Conv2d, keep_indices: torch.Tensor) -> None:
        if len(keep_indices) < self.MIN_CHANNELS:
            keep_indices = keep_indices[:self.MIN_CHANNELS]

        conv.weight.data = conv.weight.data[:, keep_indices]
        conv.in_channels = len(keep_indices)

        if conv.groups > 1 and conv.groups == conv.out_channels:
            conv.groups = conv.in_channels

    def prune_bn_layer(self, bn: nn.BatchNorm2d, keep_indices: torch.Tensor) -> None:
        if len(keep_indices) < self.MIN_CHANNELS:
            keep_indices = keep_indices[:self.MIN_CHANNELS]

        if bn.weight is not None:
            bn.weight.data = bn.weight.data[keep_indices]
        if bn.bias is not None:
            bn.bias.data = bn.bias.data[keep_indices]
        if bn.running_mean is not None:
            bn.running_mean = bn.running_mean[keep_indices]
        if bn.running_var is not None:
            bn.running_var = bn.running_var[keep_indices]
        bn.num_features = len(keep_indices)

    def prune_model(self, prune_ratios: Dict[str, float], method: str = 'l1',
                     importance_scores: Optional[Dict[str, torch.Tensor]] = None) -> nn.Module:
        self._pruning_records = {}

        for name, module in self.model.named_modules():
            if isinstance(module, nn.Conv2d) and name in prune_ratios:
                ratio = prune_ratios[name]
                self.prune_layer(name, module, ratio, method, importance_scores)

        self._propagate_pruning()
        return self.model

    def _propagate_pruning(self) -> None:
        if not self._pruning_records:
            return

        modules = dict(self.model.named_modules())
        names = list(modules.keys())
        name_to_idx = {name: i for i, name in enumerate(names)}

        for pruned_name, record in self._pruning_records.items():
            keep_indices = record['keep_indices'].to(self.device)
            pruned_module = modules[pruned_name]
            new_out_channels = record['new_out_channels']

            if pruned_name not in name_to_idx:
                continue
            start_idx = name_to_idx[pruned_name]

            for j in range(start_idx + 1, len(names)):
                next_name = names[j]
                next_module = modules[next_name]

                if isinstance(next_module, nn.BatchNorm2d):
                    orig_shape = self._original_shapes.get(next_name, {})
                    orig_features = orig_shape.get('num_features', next_module.num_features)
                    if orig_features == new_out_channels:
                        self.prune_bn_layer(next_module, keep_indices)
                    continue

                if isinstance(next_module, nn.Conv2d):
                    orig_shape = self._original_shapes.get(next_name, {})
                    orig_in = orig_shape.get('in_channels', next_module.in_channels)

                    if orig_in == new_out_channels:
                        self.prune_layer_input(next_name, next_module, keep_indices)

                    if next_module.groups > 1 and orig_shape.get('groups', 1) > 1:
                        pass

                    if next_name in self._pruning_records:
                        continue
                    break

                if isinstance(next_module, nn.Linear):
                    break

    def validate_model(self, input_shape: Tuple[int, ...] = (1, 3, 224, 224)) -> bool:
        try:
            dummy_input = torch.randn(input_shape).to(self.device)
            self.model.eval()
            with torch.no_grad():
                _ = self.model(dummy_input)
            return True
        except Exception as e:
            print(f"Model validation failed: {e}")
            return False

    def fix_zero_channel_layers(self) -> None:
        for name, module in self.model.named_modules():
            if isinstance(module, nn.Conv2d):
                if module.in_channels < self.MIN_CHANNELS:
                    orig_shape = self._original_shapes.get(name, {})
                    module.in_channels = orig_shape.get('in_channels', max(module.in_channels, self.MIN_CHANNELS))
                if module.out_channels < self.MIN_CHANNELS:
                    orig_shape = self._original_shapes.get(name, {})
                    module.out_channels = orig_shape.get('out_channels', max(module.out_channels, self.MIN_CHANNELS))
                if module.groups > module.in_channels:
                    module.groups = module.in_channels
                if module.groups < 1:
                    module.groups = 1
            elif isinstance(module, nn.BatchNorm2d):
                if module.num_features < self.MIN_CHANNELS:
                    orig_shape = self._original_shapes.get(name, {})
                    module.num_features = orig_shape.get('num_features', max(module.num_features, self.MIN_CHANNELS))

    def get_pruning_summary(self) -> Dict:
        total_channels = 0
        total_pruned = 0
        layer_details = {}

        for name, record in self._pruning_records.items():
            total_channels += record['original_channels']
            total_pruned += record['pruned_count']
            layer_details[name] = {
                'pruned': record['pruned_count'],
                'original': record['original_channels'],
                'ratio': record['prune_ratio'],
                'kept': record['original_channels'] - record['pruned_count'],
            }

        return {
            'total_channels': total_channels,
            'total_pruned': total_pruned,
            'overall_ratio': total_pruned / max(total_channels, 1),
            'layer_details': layer_details,
        }

    def reset(self) -> None:
        self.model.load_state_dict(self.original_state)
        self._pruning_records = {}
        for name, module in self.model.named_modules():
            if isinstance(module, nn.Conv2d):
                orig = self._original_shapes.get(name, {})
                module.out_channels = orig.get('out_channels', module.out_channels)
                module.in_channels = orig.get('in_channels', module.in_channels)
                module.groups = orig.get('groups', module.groups)
            elif isinstance(module, nn.BatchNorm2d):
                orig = self._original_shapes.get(name, {})
                module.num_features = orig.get('num_features', module.num_features)
