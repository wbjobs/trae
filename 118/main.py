import torch
import torch.nn as nn
import torchvision
import torchvision.transforms as transforms
from torch.utils.data import DataLoader
import copy
import argparse
import time
from typing import Dict, Optional, Tuple

from pruner import Pruner
from search import PruningSearcher
from finetune import FineTuner
from flops import compute_flops
from hardware import HardwareLatencyEstimator, get_available_hardware, get_hardware_description


def get_model(model_name: str, num_classes: int = 1000, pretrained: bool = True) -> nn.Module:
    if model_name == 'resnet18':
        model = torchvision.models.resnet18(pretrained=pretrained)
        if num_classes != 1000:
            model.fc = nn.Linear(model.fc.in_features, num_classes)
    elif model_name == 'mobilenet_v2':
        model = torchvision.models.mobilenet_v2(pretrained=pretrained)
        if num_classes != 1000:
            model.classifier[1] = nn.Linear(model.classifier[1].in_features, num_classes)
    elif model_name == 'mobilenet_v3_small':
        model = torchvision.models.mobilenet_v3_small(pretrained=pretrained)
        if num_classes != 1000:
            model.classifier[3] = nn.Linear(model.classifier[3].in_features, num_classes)
    elif model_name == 'mobilenet_v3_large':
        model = torchvision.models.mobilenet_v3_large(pretrained=pretrained)
        if num_classes != 1000:
            model.classifier[3] = nn.Linear(model.classifier[3].in_features, num_classes)
    else:
        raise ValueError(f"Unsupported model: {model_name}")

    return model


def get_cifar10_dataloaders(batch_size: int = 128, num_workers: int = 4) -> Tuple[DataLoader, DataLoader, DataLoader]:
    transform_train = transforms.Compose([
        transforms.RandomCrop(32, padding=4),
        transforms.RandomHorizontalFlip(),
        transforms.ToTensor(),
        transforms.Normalize((0.4914, 0.4822, 0.4465), (0.2023, 0.1994, 0.2010)),
    ])

    transform_test = transforms.Compose([
        transforms.ToTensor(),
        transforms.Normalize((0.4914, 0.4822, 0.4465), (0.2023, 0.1994, 0.2010)),
    ])

    train_dataset = torchvision.datasets.CIFAR10(
        root='./data', train=True, download=True, transform=transform_train
    )
    val_dataset = torchvision.datasets.CIFAR10(
        root='./data', train=False, download=True, transform=transform_test
    )

    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True,
                               num_workers=num_workers, pin_memory=True)
    val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False,
                             num_workers=num_workers, pin_memory=True)
    test_loader = val_loader

    return train_loader, val_loader, test_loader


def get_imagenet_dataloaders(data_dir: str, batch_size: int = 256,
                              num_workers: int = 8) -> Tuple[DataLoader, DataLoader, DataLoader]:
    normalize = transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )

    train_transform = transforms.Compose([
        transforms.RandomResizedCrop(224),
        transforms.RandomHorizontalFlip(),
        transforms.ToTensor(),
        normalize,
    ])

    val_transform = transforms.Compose([
        transforms.Resize(256),
        transforms.CenterCrop(224),
        transforms.ToTensor(),
        normalize,
    ])

    train_dataset = torchvision.datasets.ImageFolder(
        root=f'{data_dir}/train', transform=train_transform
    )
    val_dataset = torchvision.datasets.ImageFolder(
        root=f'{data_dir}/val', transform=val_transform
    )

    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True,
                               num_workers=num_workers, pin_memory=True)
    val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False,
                             num_workers=num_workers, pin_memory=True)

    return train_loader, val_loader, val_loader


def evaluate_accuracy(model: nn.Module, data_loader: DataLoader,
                      device: torch.device) -> float:
    model.eval()
    correct = 0
    total = 0

    with torch.no_grad():
        for inputs, targets in data_loader:
            inputs = inputs.to(device)
            targets = targets.to(device)
            outputs = model(inputs)
            _, predicted = outputs.max(1)
            total += targets.size(0)
            correct += predicted.eq(targets).sum().item()

    return correct / total


def main():
    parser = argparse.ArgumentParser(description='Model Pruning Tool')
    parser.add_argument('--model', type=str, default='resnet18',
                        choices=['resnet18', 'mobilenet_v2', 'mobilenet_v3_small', 'mobilenet_v3_large'],
                        help='Model architecture')
    parser.add_argument('--dataset', type=str, default='cifar10',
                        choices=['cifar10', 'imagenet'],
                        help='Dataset to use')
    parser.add_argument('--data-dir', type=str, default='./data',
                        help='Dataset directory')
    parser.add_argument('--method', type=str, default='l1',
                        choices=['l1', 'gradient'],
                        help='Pruning importance method')
    parser.add_argument('--strategy', type=str, default='layer_wise',
                        choices=['uniform', 'layer_wise', 'greedy'],
                        help='Pruning search strategy')
    parser.add_argument('--target-flops-ratio', type=float, default=0.5,
                        help='Target FLOPs reduction ratio')
    parser.add_argument('--epochs', type=int, default=3,
                        help='Number of finetuning epochs')
    parser.add_argument('--batch-size', type=int, default=128,
                        help='Batch size')
    parser.add_argument('--lr', type=float, default=0.001,
                        help='Learning rate for finetuning')
    parser.add_argument('--num-workers', type=int, default=4,
                        help='Number of data loading workers')
    parser.add_argument('--output', type=str, default='pruned_model.pth',
                        help='Output path for pruned model')
    parser.add_argument('--max-acc-drop', type=float, default=2.0,
                        help='Maximum acceptable accuracy drop (%)')
    parser.add_argument('--hardware', type=str, default=None,
                        choices=get_available_hardware(),
                        help='Target hardware for hardware-aware pruning')
    parser.add_argument('--target-latency-ratio', type=float, default=None,
                        help='Target latency reduction ratio (only used with --hardware)')
    parser.add_argument('--list-hardware', action='store_true',
                        help='List all available hardware profiles and exit')
    args = parser.parse_args()

    if args.list_hardware:
        print('Available hardware profiles:')
        for name in get_available_hardware():
            print(f'  {name}: {get_hardware_description(name)}')
        return

    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f'Using device: {device}')

    if args.hardware:
        print(f'Target hardware: {args.hardware}')
        print(f'  {get_hardware_description(args.hardware)}')

    print(f'\n{"="*60}')
    print(f'Model Pruning Tool')
    print(f'{"="*60}')
    print(f'Model: {args.model}')
    print(f'Dataset: {args.dataset}')
    print(f'Method: {args.method}')
    print(f'Strategy: {args.strategy}')
    print(f'Target FLOPs ratio: {args.target_flops_ratio}')
    if args.hardware:
        print(f'Target hardware: {args.hardware}')
        if args.target_latency_ratio is not None:
            print(f'Target latency ratio: {args.target_latency_ratio}')
    print(f'Finetune epochs: {args.epochs}')

    input_shape = (1, 3, 32, 32) if args.dataset == 'cifar10' else (1, 3, 224, 224)
    num_classes = 10 if args.dataset == 'cifar10' else 1000

    print(f'\n{"="*60}')
    print('Step 1: Loading model...')
    print(f'{"="*60}')
    model = get_model(args.model, num_classes=num_classes, pretrained=True)
    model = model.to(device)

    if args.dataset == 'cifar10':
        model.conv1 = nn.Conv2d(3, 64, kernel_size=3, stride=1, padding=1, bias=False)
        model.maxpool = nn.Identity()

    original_flops_result = compute_flops(model, input_shape, device)
    print(f'Original model FLOPs: {original_flops_result["total_mflops"]:.2f} MFLOPs')

    print(f'\n{"="*60}')
    print('Step 2: Loading dataset...')
    print(f'{"="*60}')
    if args.dataset == 'cifar10':
        train_loader, val_loader, test_loader = get_cifar10_dataloaders(
            batch_size=args.batch_size, num_workers=args.num_workers
        )
    else:
        train_loader, val_loader, test_loader = get_imagenet_dataloaders(
            data_dir=args.data_dir, batch_size=args.batch_size, num_workers=args.num_workers
        )

    print(f'\n{"="*60}')
    print('Step 3: Evaluating original model...')
    print(f'{"="*60}')
    original_acc = evaluate_accuracy(model, test_loader, device)
    print(f'Original model accuracy: {100.0 * original_acc:.2f}%')

    importance_scores = None
    if args.method == 'gradient':
        print(f'\n{"="*60}')
        print('Step 4: Computing gradient sensitivity...')
        print(f'{"="*60}')
        criterion = nn.CrossEntropyLoss()
        pruner_temp = Pruner(copy.deepcopy(model), device)
        importance_scores = pruner_temp.compute_gradient_sensitivity(
            train_loader, criterion, num_batches=10
        )
        print('Gradient sensitivity computed.')

    print(f'\n{"="*60}')
    print('Step 5: Searching optimal pruning ratios...')
    print(f'{"="*60}')
    searcher = PruningSearcher(
        copy.deepcopy(model), device, input_shape,
        hardware_name=args.hardware
    )
    prune_ratios = searcher.search(
        strategy=args.strategy,
        target_flops_ratio=args.target_flops_ratio,
        method=args.method,
        importance_scores=importance_scores,
        target_latency_ratio=args.target_latency_ratio
    )

    print('Pruning ratios per layer:')
    for name, ratio in sorted(prune_ratios.items()):
        if ratio > 0:
            print(f'  {name}: {ratio:.3f}')

    print(f'\n{"="*60}')
    print('Step 6: Applying pruning...')
    print(f'{"="*60}')
    pruner = Pruner(copy.deepcopy(model), device)
    pruned_model = pruner.prune_model(prune_ratios, args.method, importance_scores)

    pruner.fix_zero_channel_layers()

    if not pruner.validate_model(input_shape):
        print('ERROR: Pruned model is invalid (zero-channel layers detected).')
        print('Reducing pruning ratios and retrying...')
        for name in prune_ratios:
            prune_ratios[name] *= 0.8
        pruner = Pruner(copy.deepcopy(model), device)
        pruned_model = pruner.prune_model(prune_ratios, args.method, importance_scores)
        pruner.fix_zero_channel_layers()
        if not pruner.validate_model(input_shape):
            print('FATAL: Pruned model still invalid after reducing ratios. Aborting.')
            return None

    pruned_flops_result = compute_flops(pruned_model, input_shape, device)
    flops_reduction = (1 - pruned_flops_result['total_flops'] / original_flops_result['total_flops']) * 100
    print(f'Pruned model FLOPs: {pruned_flops_result["total_mflops"]:.2f} MFLOPs')
    print(f'FLOPs reduction: {flops_reduction:.2f}%')

    pruning_summary = pruner.get_pruning_summary()
    print(f'Total channels pruned: {pruning_summary["total_pruned"]} / {pruning_summary["total_channels"]}')
    print(f'Overall pruning ratio: {pruning_summary["overall_ratio"]:.3f}')

    print(f'\n{"="*60}')
    print('Step 7: Evaluating pruned model (before finetune)...')
    print(f'{"="*60}')
    pruned_acc_before = evaluate_accuracy(pruned_model, test_loader, device)
    acc_drop = (original_acc - pruned_acc_before) * 100
    print(f'Pruned model accuracy: {100.0 * pruned_acc_before:.2f}%')
    print(f'Accuracy drop: {acc_drop:.2f}%')

    print(f'\n{"="*60}')
    print('Step 8: Finetuning...')
    print(f'{"="*60}')
    finetuner = FineTuner(pruned_model, device)
    history = finetuner.finetune(
        train_loader, val_loader,
        num_epochs=args.epochs,
        learning_rate=args.lr
    )

    print(f'\n{"="*60}')
    print('Step 9: Final evaluation...')
    print(f'{"="*60}')
    final_acc = evaluate_accuracy(pruned_model, test_loader, device)
    final_acc_drop = (original_acc - final_acc) * 100
    print(f'Original accuracy: {100.0 * original_acc:.2f}%')
    print(f'Final accuracy: {100.0 * final_acc:.2f}%')
    print(f'Accuracy drop: {final_acc_drop:.2f}%')
    print(f'FLOPs reduction: {flops_reduction:.2f}%')

    if final_acc_drop <= args.max_acc_drop and flops_reduction >= 50:
        print(f'\n{"="*60}')
        print('SUCCESS: Pruning meets requirements!')
        print(f'{"="*60}')
    else:
        print(f'\n{"="*60}')
        print('WARNING: Pruning may not meet all requirements.')
        if final_acc_drop > args.max_acc_drop:
            print(f'  Accuracy drop {final_acc_drop:.2f}% > max allowed {args.max_acc_drop:.2f}%')
        if flops_reduction < 50:
            print(f'  FLOPs reduction {flops_reduction:.2f}% < target 50%')
        print(f'{"="*60}')

    print(f'\n{"="*60}')
    print('Step 10: Saving model...')
    print(f'{"="*60}')
    finetuner.save_model(args.output)

    hardware_improvement = None
    if args.hardware and searcher.latency_estimator is not None:
        print(f'\n{"="*60}')
        print('Step 11: Hardware latency estimation...')
        print(f'{"="*60}')
        hardware_improvement = searcher.estimate_hardware_improvement(pruned_model)
        print(f'Hardware: {hardware_improvement["hardware"]}')
        print(f'Original latency: {hardware_improvement["original_latency_ms"]:.3f} ms '
              f'(~{hardware_improvement["original_estimated_fps"]:.1f} FPS)')
        print(f'Pruned latency: {hardware_improvement["pruned_latency_ms"]:.3f} ms '
              f'(~{hardware_improvement["pruned_estimated_fps"]:.1f} FPS)')
        print(f'Latency reduction: {hardware_improvement["latency_reduction_ms"]:.3f} ms '
              f'({hardware_improvement["latency_reduction_pct"]:.1f}%)')
        print(f'Estimated speedup: {hardware_improvement["speedup"]:.2f}x')

    print(f'\n{"="*60}')
    print('Summary')
    print(f'{"="*60}')
    print(f'Model: {args.model}')
    print(f'Dataset: {args.dataset}')
    print(f'Original FLOPs: {original_flops_result["total_mflops"]:.2f} MFLOPs')
    print(f'Pruned FLOPs: {pruned_flops_result["total_mflops"]:.2f} MFLOPs')
    print(f'FLOPs reduction: {flops_reduction:.2f}%')
    print(f'Original accuracy: {100.0 * original_acc:.2f}%')
    print(f'Final accuracy: {100.0 * final_acc:.2f}%')
    print(f'Accuracy drop: {final_acc_drop:.2f}%')
    if hardware_improvement:
        print(f'Target hardware: {args.hardware}')
        print(f'Original latency: {hardware_improvement["original_latency_ms"]:.3f} ms')
        print(f'Pruned latency: {hardware_improvement["pruned_latency_ms"]:.3f} ms')
        print(f'Speedup: {hardware_improvement["speedup"]:.2f}x')
    print(f'Model saved to: {args.output}')

    result = {
        'original_flops': original_flops_result['total_flops'],
        'pruned_flops': pruned_flops_result['total_flops'],
        'flops_reduction': flops_reduction,
        'original_accuracy': original_acc,
        'final_accuracy': final_acc,
        'accuracy_drop': final_acc_drop,
    }
    if hardware_improvement:
        result['hardware'] = hardware_improvement

    return result


if __name__ == '__main__':
    main()
