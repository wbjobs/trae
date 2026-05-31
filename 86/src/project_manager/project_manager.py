import json
import os
import uuid
from pathlib import Path
from typing import Optional, Dict, Any, List
from datetime import datetime
import yaml
from src.core.models import ProjectInfo, DeviceConfig, TagPoint, PointType, DataType, DeviceStatus
from src.core.encryption import EncryptionManager
from src.core.event_bus import EventBus, EventType


class ProjectManager:
    def __init__(self):
        self._current_project: Optional[ProjectInfo] = None
        self._project_path: Optional[str] = None
        self._encryption = EncryptionManager()
        self._event_bus = EventBus()

    @property
    def current_project(self) -> Optional[ProjectInfo]:
        return self._current_project

    @property
    def project_path(self) -> Optional[str]:
        return self._project_path

    def create_project(self, project_name: str, author: str = "", description: str = "") -> ProjectInfo:
        project = ProjectInfo(
            project_id=str(uuid.uuid4()),
            project_name=project_name,
            author=author,
            description=description,
            create_time=datetime.now(),
            update_time=datetime.now()
        )
        self._current_project = project
        self._event_bus.publish(EventType.PROJECT_LOADED, project)
        return project

    def save_project(self, file_path: str, password: Optional[str] = None) -> bool:
        if self._current_project is None:
            return False
        try:
            self._current_project.update_time = datetime.now()
            project_data = self._project_to_dict(self._current_project)
            if password:
                self._encryption.encrypt_file(file_path, project_data, password)
            else:
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(project_data, f, indent=4, ensure_ascii=False, default=str)
            self._project_path = file_path
            self._event_bus.publish(EventType.PROJECT_SAVED, file_path)
            return True
        except Exception as e:
            print(f"Save project error: {e}")
            return False

    def load_project(self, file_path: str, password: Optional[str] = None) -> Optional[ProjectInfo]:
        try:
            if password:
                project_data = self._encryption.decrypt_file(file_path, password)
            else:
                with open(file_path, 'r', encoding='utf-8') as f:
                    project_data = json.load(f)
            project = self._dict_to_project(project_data)
            self._current_project = project
            self._project_path = file_path
            self._event_bus.publish(EventType.PROJECT_LOADED, project)
            return project
        except Exception as e:
            print(f"Load project error: {e}")
            return None

    def import_project(self, file_path: str) -> Optional[ProjectInfo]:
        ext = Path(file_path).suffix.lower()
        try:
            if ext in ['.json']:
                return self.load_project(file_path)
            elif ext in ['.yaml', '.yml']:
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = yaml.safe_load(f)
                project = self._dict_to_project(data)
                self._current_project = project
                self._project_path = file_path
                return project
            elif ext == '.csv':
                return self._import_from_csv(file_path)
        except Exception as e:
            print(f"Import project error: {e}")
        return None

    def export_project(self, file_path: str, format: str = 'json', password: Optional[str] = None) -> bool:
        if self._current_project is None:
            return False
        try:
            project_data = self._project_to_dict(self._current_project)
            if format == 'json':
                if password:
                    self._encryption.encrypt_file(file_path, project_data, password)
                else:
                    with open(file_path, 'w', encoding='utf-8') as f:
                        json.dump(project_data, f, indent=4, ensure_ascii=False, default=str)
            elif format in ['yaml', 'yml']:
                with open(file_path, 'w', encoding='utf-8') as f:
                    yaml.dump(project_data, f, allow_unicode=True, default_flow_style=False)
            elif format == 'csv':
                return self._export_to_csv(file_path)
            return True
        except Exception as e:
            print(f"Export project error: {e}")
            return False

    def _project_to_dict(self, project: ProjectInfo) -> Dict[str, Any]:
        return {
            "project_id": project.project_id,
            "project_name": project.project_name,
            "version": project.version,
            "author": project.author,
            "create_time": project.create_time.isoformat() if project.create_time else None,
            "update_time": project.update_time.isoformat() if project.update_time else None,
            "description": project.description,
            "devices": {
                device_id: self._device_to_dict(device)
                for device_id, device in project.devices.items()
            },
            "scripts": project.scripts,
            "parameters": project.parameters
        }

    def _device_to_dict(self, device: DeviceConfig) -> Dict[str, Any]:
        return {
            "device_id": device.device_id,
            "device_name": device.device_name,
            "protocol": device.protocol,
            "ip_address": device.ip_address,
            "port": device.port,
            "serial_port": device.serial_port,
            "baud_rate": device.baud_rate,
            "timeout": device.timeout,
            "status": device.status.value,
            "tags": {
                tag_name: self._tag_to_dict(tag)
                for tag_name, tag in device.tags.items()
            }
        }

    def _tag_to_dict(self, tag: TagPoint) -> Dict[str, Any]:
        return {
            "name": tag.name,
            "address": tag.address,
            "point_type": tag.point_type.value,
            "data_type": tag.data_type.value,
            "description": tag.description,
            "unit": tag.unit,
            "min_value": tag.min_value,
            "max_value": tag.max_value,
            "default_value": tag.default_value,
            "current_value": tag.current_value,
            "alarm_low": tag.alarm_low,
            "alarm_high": tag.alarm_high,
            "coefficient": tag.coefficient,
            "offset": tag.offset,
            "read_only": tag.read_only,
            "group": tag.group,
            "last_update": tag.last_update.isoformat() if tag.last_update else None
        }

    def _dict_to_project(self, data: Dict[str, Any]) -> ProjectInfo:
        project = ProjectInfo(
            project_id=data.get("project_id", str(uuid.uuid4())),
            project_name=data.get("project_name", "Untitled"),
            version=data.get("version", "1.0"),
            author=data.get("author", ""),
            description=data.get("description", "")
        )
        create_time = data.get("create_time")
        if create_time:
            project.create_time = datetime.fromisoformat(create_time)
        update_time = data.get("update_time")
        if update_time:
            project.update_time = datetime.fromisoformat(update_time)
        devices_data = data.get("devices", {})
        for device_id, device_data in devices_data.items():
            device = self._dict_to_device(device_data)
            project.devices[device_id] = device
        project.scripts = data.get("scripts", {})
        project.parameters = data.get("parameters", {})
        return project

    def _dict_to_device(self, data: Dict[str, Any]) -> DeviceConfig:
        device = DeviceConfig(
            device_id=data.get("device_id", ""),
            device_name=data.get("device_name", ""),
            protocol=data.get("protocol", ""),
            ip_address=data.get("ip_address", ""),
            port=data.get("port", 0),
            serial_port=data.get("serial_port", ""),
            baud_rate=data.get("baud_rate", 9600),
            timeout=data.get("timeout", 5000)
        )
        status = data.get("status")
        if status:
            try:
                device.status = DeviceStatus(status)
            except ValueError:
                device.status = DeviceStatus.OFFLINE
        tags_data = data.get("tags", {})
        for tag_name, tag_data in tags_data.items():
            tag = self._dict_to_tag(tag_data)
            device.tags[tag_name] = tag
        return device

    def _dict_to_tag(self, data: Dict[str, Any]) -> TagPoint:
        try:
            point_type = PointType(data.get("point_type", "AI"))
        except ValueError:
            point_type = PointType.AI
        try:
            data_type = DataType(data.get("data_type", "float32"))
        except ValueError:
            data_type = DataType.FLOAT32
        tag = TagPoint(
            name=data.get("name", ""),
            address=data.get("address", ""),
            point_type=point_type,
            data_type=data_type,
            description=data.get("description", ""),
            unit=data.get("unit", ""),
            min_value=float(data.get("min_value", 0.0) or 0.0),
            max_value=float(data.get("max_value", 100.0) or 100.0),
            default_value=data.get("default_value", 0),
            current_value=data.get("current_value", 0),
            alarm_low=data.get("alarm_low"),
            alarm_high=data.get("alarm_high"),
            coefficient=float(data.get("coefficient", 1.0) or 1.0),
            offset=float(data.get("offset", 0.0) or 0.0),
            read_only=bool(data.get("read_only", False)),
            group=data.get("group", "default")
        )
        last_update = data.get("last_update")
        if last_update:
            tag.last_update = datetime.fromisoformat(last_update)
        return tag

    def _import_from_csv(self, file_path: str) -> Optional[ProjectInfo]:
        import csv
        project = self.create_project(Path(file_path).stem)
        device = DeviceConfig(
            device_id="imported_device",
            device_name="Imported Device",
            protocol="modbus"
        )
        encoding = 'utf-8-sig' if os.name == 'nt' else 'utf-8'
        try:
            with open(file_path, 'r', encoding=encoding) as f:
                reader = csv.DictReader(f)
                for row in reader:
                    try:
                        point_type = PointType(row.get('point_type', 'AI'))
                    except ValueError:
                        point_type = PointType.AI
                    try:
                        data_type = DataType(row.get('data_type', 'float32'))
                    except ValueError:
                        data_type = DataType.FLOAT32
                    try:
                        min_val = float(row.get('min_value', 0))
                    except (ValueError, TypeError):
                        min_val = 0.0
                    try:
                        max_val = float(row.get('max_value', 100))
                    except (ValueError, TypeError):
                        max_val = 100.0
                    try:
                        coeff = float(row.get('coefficient', 1.0))
                    except (ValueError, TypeError):
                        coeff = 1.0
                    try:
                        offs = float(row.get('offset', 0.0))
                    except (ValueError, TypeError):
                        offs = 0.0
                    tag = TagPoint(
                        name=row.get('name', ''),
                        address=row.get('address', ''),
                        point_type=point_type,
                        data_type=data_type,
                        description=row.get('description', ''),
                        unit=row.get('unit', ''),
                        min_value=min_val,
                        max_value=max_val,
                        coefficient=coeff,
                        offset=offs
                    )
                    if tag.name:
                        device.tags[tag.name] = tag
        except UnicodeDecodeError:
            with open(file_path, 'r', encoding='gbk', errors='replace') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    try:
                        point_type = PointType(row.get('point_type', 'AI'))
                    except ValueError:
                        point_type = PointType.AI
                    try:
                        data_type = DataType(row.get('data_type', 'float32'))
                    except ValueError:
                        data_type = DataType.FLOAT32
                    tag = TagPoint(
                        name=row.get('name', ''),
                        address=row.get('address', ''),
                        point_type=point_type,
                        data_type=data_type,
                        description=row.get('description', ''),
                        unit=row.get('unit', ''),
                        min_value=float(row.get('min_value', 0) or 0),
                        max_value=float(row.get('max_value', 100) or 100),
                        coefficient=float(row.get('coefficient', 1.0) or 1.0),
                        offset=float(row.get('offset', 0.0) or 0.0)
                    )
                    if tag.name:
                        device.tags[tag.name] = tag
        project.devices[device.device_id] = device
        return project

    def _export_to_csv(self, file_path: str) -> bool:
        import csv
        if self._current_project is None:
            return False
        encoding = 'utf-8-sig' if os.name == 'nt' else 'utf-8'
        with open(file_path, 'w', encoding=encoding, newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['name', 'address', 'point_type', 'data_type', 'description',
                           'unit', 'min_value', 'max_value', 'coefficient', 'offset', 'group'])
            for device in self._current_project.devices.values():
                for tag in device.tags.values():
                    writer.writerow([
                        tag.name, tag.address, tag.point_type.value, tag.data_type.value,
                        tag.description, tag.unit, tag.min_value, tag.max_value,
                        tag.coefficient, tag.offset, tag.group
                    ])
        return True

    def add_device(self, device: DeviceConfig):
        if self._current_project:
            self._current_project.devices[device.device_id] = device
            self._current_project.update_time = datetime.now()

    def remove_device(self, device_id: str):
        if self._current_project and device_id in self._current_project.devices:
            del self._current_project.devices[device_id]
            self._current_project.update_time = datetime.now()

    def get_all_tags(self) -> Dict[str, TagPoint]:
        all_tags = {}
        if self._current_project:
            for device in self._current_project.devices.values():
                for tag_name, tag in device.tags.items():
                    all_tags[f"{device.device_id}.{tag_name}"] = tag
        return all_tags
