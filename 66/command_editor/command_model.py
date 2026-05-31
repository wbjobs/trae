import uuid
import time
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class CommandType(Enum):
    SINGLE = 'single'
    SEQUENCE = 'sequence'
    PARALLEL = 'parallel'
    CONDITIONAL = 'conditional'


class StepStatus(Enum):
    PENDING = 'pending'
    RUNNING = 'running'
    COMPLETED = 'completed'
    FAILED = 'failed'
    SKIPPED = 'skipped'


@dataclass
class CommandParameter:
    name: str
    param_type: str
    default_value: Any = None
    required: bool = False
    description: str = ''
    options: List[Any] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'name': self.name,
            'type': self.param_type,
            'default': self.default_value,
            'required': self.required,
            'description': self.description,
            'options': self.options
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'CommandParameter':
        return cls(
            name=data['name'],
            param_type=data.get('type', 'string'),
            default_value=data.get('default'),
            required=data.get('required', False),
            description=data.get('description', ''),
            options=data.get('options', [])
        )


@dataclass
class CommandStep:
    step_id: str
    device_id: str
    command: str
    order: int = 0
    params: Dict[str, Any] = field(default_factory=dict)
    delay_before: float = 0.0
    delay_after: float = 0.0
    timeout: float = 5.0
    retry_count: int = 0
    condition: str = ''
    status: StepStatus = StepStatus.PENDING
    error_message: str = ''
    result: Any = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            'step_id': self.step_id,
            'device_id': self.device_id,
            'command': self.command,
            'order': self.order,
            'params': self.params,
            'delay_before': self.delay_before,
            'delay_after': self.delay_after,
            'timeout': self.timeout,
            'retry_count': self.retry_count,
            'condition': self.condition
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'CommandStep':
        return cls(
            step_id=data.get('step_id', str(uuid.uuid4())),
            device_id=data['device_id'],
            command=data['command'],
            order=data.get('order', 0),
            params=data.get('params', {}),
            delay_before=data.get('delay_before', 0.0),
            delay_after=data.get('delay_after', 0.0),
            timeout=data.get('timeout', 5.0),
            retry_count=data.get('retry_count', 0),
            condition=data.get('condition', '')
        )


@dataclass
class Command:
    command_id: str
    name: str
    description: str = ''
    command_type: CommandType = CommandType.SEQUENCE
    steps: List[CommandStep] = field(default_factory=list)
    parameters: List[CommandParameter] = field(default_factory=list)
    shortcut_key: str = ''
    icon: str = ''
    category: str = 'default'
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'command_id': self.command_id,
            'name': self.name,
            'description': self.description,
            'command_type': self.command_type.value,
            'steps': [step.to_dict() for step in self.steps],
            'parameters': [param.to_dict() for param in self.parameters],
            'shortcut_key': self.shortcut_key,
            'icon': self.icon,
            'category': self.category,
            'created_at': self.created_at,
            'updated_at': self.updated_at
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Command':
        steps = [CommandStep.from_dict(s) for s in data.get('steps', [])]
        steps.sort(key=lambda s: s.order)
        for i, step in enumerate(steps):
            step.order = i
        return cls(
            command_id=data.get('command_id', str(uuid.uuid4())),
            name=data['name'],
            description=data.get('description', ''),
            command_type=CommandType(data.get('command_type', 'sequence')),
            steps=steps,
            parameters=[CommandParameter.from_dict(p) for p in data.get('parameters', [])],
            shortcut_key=data.get('shortcut_key', ''),
            icon=data.get('icon', ''),
            category=data.get('category', 'default'),
            created_at=data.get('created_at', time.time()),
            updated_at=data.get('updated_at', time.time())
        )

    def validate(self) -> bool:
        if not self.name:
            return False
        if not self.steps:
            return False
        for step in self.steps:
            if not step.device_id or not step.command:
                return False
        return True


@dataclass
class CommandGroup:
    group_id: str
    name: str
    description: str = ''
    command_ids: List[str] = field(default_factory=list)
    icon: str = ''
    expanded: bool = True

    def to_dict(self) -> Dict[str, Any]:
        return {
            'group_id': self.group_id,
            'name': self.name,
            'description': self.description,
            'command_ids': self.command_ids,
            'icon': self.icon,
            'expanded': self.expanded
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'CommandGroup':
        return cls(
            group_id=data.get('group_id', str(uuid.uuid4())),
            name=data['name'],
            description=data.get('description', ''),
            command_ids=data.get('command_ids', []),
            icon=data.get('icon', ''),
            expanded=data.get('expanded', True)
        )
