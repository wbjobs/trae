import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from typing import Optional, Tuple, Dict
from tqdm import tqdm


class FineTuner:
    def __init__(self, model: nn.Module, device: Optional[torch.device] = None):
        self.model = model
        self.device = device or torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.model = self.model.to(self.device)

    def train_epoch(self, train_loader: DataLoader, criterion: nn.Module,
                     optimizer: optim.Optimizer) -> Tuple[float, float]:
        self.model.train()
        total_loss = 0.0
        correct = 0
        total = 0

        pbar = tqdm(train_loader, desc='Training')
        for inputs, targets in pbar:
            inputs = inputs.to(self.device)
            targets = targets.to(self.device)

            optimizer.zero_grad()
            outputs = self.model(inputs)
            loss = criterion(outputs, targets)
            loss.backward()
            optimizer.step()

            total_loss += loss.item() * inputs.size(0)
            _, predicted = outputs.max(1)
            total += targets.size(0)
            correct += predicted.eq(targets).sum().item()

            pbar.set_postfix({
                'loss': f'{loss.item():.4f}',
                'acc': f'{100.0 * correct / total:.2f}%'
            })

        avg_loss = total_loss / total
        accuracy = correct / total
        return avg_loss, accuracy

    def validate(self, val_loader: DataLoader, criterion: nn.Module) -> Tuple[float, float]:
        self.model.eval()
        total_loss = 0.0
        correct = 0
        total = 0

        with torch.no_grad():
            pbar = tqdm(val_loader, desc='Validating')
            for inputs, targets in pbar:
                inputs = inputs.to(self.device)
                targets = targets.to(self.device)

                outputs = self.model(inputs)
                loss = criterion(outputs, targets)

                total_loss += loss.item() * inputs.size(0)
                _, predicted = outputs.max(1)
                total += targets.size(0)
                correct += predicted.eq(targets).sum().item()

                pbar.set_postfix({
                    'loss': f'{loss.item():.4f}',
                    'acc': f'{100.0 * correct / total:.2f}%'
                })

        avg_loss = total_loss / total
        accuracy = correct / total
        return avg_loss, accuracy

    def finetune(self, train_loader: DataLoader, val_loader: DataLoader,
                 num_epochs: int = 3, learning_rate: float = 0.001,
                 weight_decay: float = 1e-4,
                 criterion: Optional[nn.Module] = None) -> Dict:
        if criterion is None:
            criterion = nn.CrossEntropyLoss()

        optimizer = optim.SGD(
            self.model.parameters(),
            lr=learning_rate,
            momentum=0.9,
            weight_decay=weight_decay
        )

        scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=num_epochs)

        history = {
            'train_loss': [],
            'train_acc': [],
            'val_loss': [],
            'val_acc': [],
        }

        best_val_acc = 0.0

        for epoch in range(num_epochs):
            print(f'\nEpoch {epoch + 1}/{num_epochs}')
            print('-' * 50)

            train_loss, train_acc = self.train_epoch(train_loader, criterion, optimizer)
            val_loss, val_acc = self.validate(val_loader, criterion)

            scheduler.step()

            history['train_loss'].append(train_loss)
            history['train_acc'].append(train_acc)
            history['val_loss'].append(val_loss)
            history['val_acc'].append(val_acc)

            print(f'Train Loss: {train_loss:.4f}, Train Acc: {100.0 * train_acc:.2f}%')
            print(f'Val Loss: {val_loss:.4f}, Val Acc: {100.0 * val_acc:.2f}%')

            if val_acc > best_val_acc:
                best_val_acc = val_acc

        history['best_val_acc'] = best_val_acc
        return history

    def evaluate(self, test_loader: DataLoader) -> Dict:
        self.model.eval()
        correct_top1 = 0
        correct_top5 = 0
        total = 0

        with torch.no_grad():
            pbar = tqdm(test_loader, desc='Evaluating')
            for inputs, targets in pbar:
                inputs = inputs.to(self.device)
                targets = targets.to(self.device)

                outputs = self.model(inputs)

                _, top1_pred = outputs.max(1)
                correct_top1 += top1_pred.eq(targets).sum().item()

                _, top5_pred = outputs.topk(5, 1, True, True)
                top5_pred = top5_pred.t()
                correct_top5 += top5_pred.eq(targets.view(1, -1).expand_as(top5_pred)).sum().item()

                total += targets.size(0)

                pbar.set_postfix({
                    'top1': f'{100.0 * correct_top1 / total:.2f}%',
                    'top5': f'{100.0 * correct_top5 / total:.2f}%'
                })

        return {
            'top1_accuracy': correct_top1 / total,
            'top5_accuracy': correct_top5 / total,
            'total_samples': total,
        }

    def save_model(self, filepath: str) -> None:
        torch.save({
            'model_state_dict': self.model.state_dict(),
            'model_structure': self.model,
        }, filepath)
        print(f'Model saved to {filepath}')

    def load_model(self, filepath: str) -> None:
        checkpoint = torch.load(filepath, map_location=self.device)
        self.model.load_state_dict(checkpoint['model_state_dict'])
        self.model = self.model.to(self.device)
        print(f'Model loaded from {filepath}')
