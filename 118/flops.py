import torch
import torch.nn as nn
from typing import Dict, Tuple, Optional


def count_conv2d_hook(module: nn.Conv2d, input: torch.Tensor, output: torch.Tensor) -> None:
    batch_size, _, output_h, output_w = output.shape
    kernel_h, kernel_w = module.kernel_size
    in_channels = module.in_channels
    out_channels = module.out_channels
    groups = module.groups

    flops_per_instance = (2 * in_channels // groups * kernel_h * kernel_w - (1 if not module.bias else 0))
    total_flops = batch_size * flops_per_instance * out_channels * output_h * output_w
    module.__flops__ = total_flops


def count_linear_hook(module: nn.Linear, input: torch.Tensor, output: torch.Tensor) -> None:
    batch_size = input[0].shape[0]
    weight_flops = 2 * module.in_features - (0 if module.bias is None else 1)
    total_flops = batch_size * weight_flops * module.out_features
    module.__flops__ = total_flops


def count_bn2d_hook(module: nn.BatchNorm2d, input: torch.Tensor, output: torch.Tensor) -> None:
    batch_size, channels, h, w = input[0].shape
    total_flops = batch_size * channels * h * w * 2
    module.__flops__ = total_flops


def count_relu_hook(module: nn.ReLU, input: torch.Tensor, output: torch.Tensor) -> None:
    module.__flops__ = input[0].numel()


def count_pool_hook(module: nn.Module, input: torch.Tensor, output: torch.Tensor) -> None:
    module.__flops__ = input[0].numel()


_HOOKS = {
    nn.Conv2d: count_conv2d_hook,
    nn.Linear: count_linear_hook,
    nn.BatchNorm2d: count_bn2d_hook,
    nn.BatchNorm1d: count_bn2d_hook,
    nn.ReLU: count_relu_hook,
    nn.ReLU6: count_relu_hook,
    nn.MaxPool2d: count_pool_hook,
    nn.AvgPool2d: count_pool_hook,
    nn.AdaptiveAvgPool2d: count_pool_hook,
}


def register_flops_hooks(model: nn.Module) -> list:
    hooks = []
    for module in model.modules():
        hook_fn = _HOOKS.get(type(module))
        if hook_fn is not None:
            hook = module.register_forward_hook(hook_fn)
            hooks.append(hook)
    return hooks


def remove_hooks(hooks: list) -> None:
    for hook in hooks:
        hook.remove()


def compute_flops(model: nn.Module, input_shape: Tuple[int, ...] = (1, 3, 224, 224),
                  device: Optional[torch.device] = None) -> Dict:
    if device is None:
        device = next(model.parameters()).device

    hooks = register_flops_hooks(model)
    dummy_input = torch.randn(input_shape).to(device)

    was_training = model.training
    model.eval()

    with torch.no_grad():
        _ = model(dummy_input)

    if was_training:
        model.train()

    per_layer = {}
    total = 0
    for name, module in model.named_modules():
        if hasattr(module, '__flops__'):
            flops = module.__flops__
            per_layer[name] = {
                'type': type(module).__name__,
                'flops': flops,
                'params': sum(p.numel() for p in module.parameters(recurse=False)),
            }
            total += flops
            delattr(module, '__flops__')

    remove_hooks(hooks)

    return {
        'total_flops': total,
        'total_mflops': total / 1e6,
        'total_gflops': total / 1e9,
        'per_layer': per_layer,
    }


def compute_layer_flops(model: nn.Module, target_layer: nn.Module,
                        input_shape: Tuple[int, ...] = (1, 3, 224, 224),
                        device: Optional[torch.device] = None) -> int:
    if device is None:
        device = next(model.parameters()).device

    hook_fn = _HOOKS.get(type(target_layer))
    if hook_fn is None:
        return 0

    captured = {}

    def capture_hook(module, inp, out):
        hook_fn(module, inp, out)
        captured['flops'] = module.__flops__
        delattr(module, '__flops__')

    hook = target_layer.register_forward_hook(capture_hook)
    dummy_input = torch.randn(input_shape).to(device)

    was_training = model.training
    model.eval()

    with torch.no_grad():
        _ = model(dummy_input)

    if was_training:
        model.train()

    hook.remove()
    return captured.get('flops', 0)
