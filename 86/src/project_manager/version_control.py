import json
import os
import shutil
import difflib
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime
from pathlib import Path
from dataclasses import dataclass, field
from enum import Enum
import hashlib


class VersionChangeType(Enum):
    CREATE = "create"
    MODIFY = "modify"
    DELETE = "delete"
    TAG_ADD = "tag_add"
    TAG_REMOVE = "tag_remove"
    TAG_MODIFY = "tag_modify"
    DEVICE_ADD = "device_add"
    DEVICE_REMOVE = "device_remove"
    DEVICE_MODIFY = "device_modify"
    SCRIPT_ADD = "script_add"
    SCRIPT_REMOVE = "script_remove"
    SCRIPT_MODIFY = "script_modify"


@dataclass
class VersionChange:
    change_type: VersionChangeType
    target: str
    old_value: Any = None
    new_value: Any = None
    description: str = ""


@dataclass
class ProjectVersion:
    version_id: str
    version_number: str
    create_time: datetime
    author: str
    description: str
    changes: List[VersionChange] = field(default_factory=list)
    file_path: str = ""
    checksum: str = ""


class VersionControlManager:
    def __init__(self, project_path: str):
        self._project_path = project_path
        self._versions_dir = Path(project_path).parent / ".versions"
        self._versions_dir.mkdir(exist_ok=True)
        self._versions: List[ProjectVersion] = []
        self._load_versions()

    def _load_versions(self):
        index_file = self._versions_dir / "versions.json"
        if index_file.exists():
            try:
                with open(index_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                for v_data in data:
                    version = ProjectVersion(
                        version_id=v_data["version_id"],
                        version_number=v_data["version_number"],
                        create_time=datetime.fromisoformat(v_data["create_time"]),
                        author=v_data.get("author", ""),
                        description=v_data.get("description", ""),
                        file_path=v_data.get("file_path", ""),
                        checksum=v_data.get("checksum", "")
                    )
                    for c_data in v_data.get("changes", []):
                        version.changes.append(VersionChange(
                            change_type=VersionChangeType(c_data["change_type"]),
                            target=c_data["target"],
                            old_value=c_data.get("old_value"),
                            new_value=c_data.get("new_value"),
                            description=c_data.get("description", "")
                        ))
                    self._versions.append(version)
            except Exception as e:
                print(f"Load versions error: {e}")

    def _save_versions(self):
        index_file = self._versions_dir / "versions.json"
        data = []
        for version in self._versions:
            v_data = {
                "version_id": version.version_id,
                "version_number": version.version_number,
                "create_time": version.create_time.isoformat(),
                "author": version.author,
                "description": version.description,
                "file_path": version.file_path,
                "checksum": version.checksum,
                "changes": [
                    {
                        "change_type": c.change_type.value,
                        "target": c.target,
                        "old_value": c.old_value,
                        "new_value": c.new_value,
                        "description": c.description
                    }
                    for c in version.changes
                ]
            }
            data.append(v_data)
        with open(index_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False, default=str)

    def _calculate_checksum(self, file_path: str) -> str:
        sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                sha256.update(chunk)
        return sha256.hexdigest()

    def create_version(self, author: str, description: str, changes: List[VersionChange] = None) -> ProjectVersion:
        if not Path(self._project_path).exists():
            raise FileNotFoundError(f"Project file not found: {self._project_path}")
        
        import uuid
        version_id = str(uuid.uuid4())
        version_number = self._generate_version_number()
        timestamp = datetime.now()
        
        version_file = self._versions_dir / f"{version_number}_{timestamp.strftime('%Y%m%d_%H%M%S')}.json"
        shutil.copy2(self._project_path, version_file)
        
        checksum = self._calculate_checksum(str(version_file))
        
        version = ProjectVersion(
            version_id=version_id,
            version_number=version_number,
            create_time=timestamp,
            author=author,
            description=description,
            changes=changes or [],
            file_path=str(version_file),
            checksum=checksum
        )
        
        self._versions.append(version)
        self._save_versions()
        return version

    def _generate_version_number(self) -> str:
        if not self._versions:
            return "1.0.0"
        last_version = self._versions[-1].version_number
        parts = last_version.split('.')
        if len(parts) == 3:
            major, minor, patch = int(parts[0]), int(parts[1]), int(parts[2])
            patch += 1
            return f"{major}.{minor}.{patch}"
        return f"{len(self._versions) + 1}.0.0"

    def compare_versions(self, version1_id: str, version2_id: str) -> List[VersionChange]:
        v1 = self._get_version_by_id(version1_id)
        v2 = self._get_version_by_id(version2_id)
        if not v1 or not v2:
            return []
        return self._compare_project_files(v1.file_path, v2.file_path)

    def _get_version_by_id(self, version_id: str) -> Optional[ProjectVersion]:
        for v in self._versions:
            if v.version_id == version_id:
                return v
        return None

    def _compare_project_files(self, file1: str, file2: str) -> List[VersionChange]:
        changes = []
        try:
            with open(file1, 'r', encoding='utf-8') as f:
                data1 = json.load(f)
            with open(file2, 'r', encoding='utf-8') as f:
                data2 = json.load(f)
            
            changes.extend(self._compare_devices(data1.get("devices", {}), data2.get("devices", {})))
            changes.extend(self._compare_scripts(data1.get("scripts", {}), data2.get("scripts", {})))
            changes.extend(self._compare_parameters(data1.get("parameters", {}), data2.get("parameters", {})))
            
        except Exception as e:
            print(f"Compare versions error: {e}")
        return changes

    def _compare_devices(self, old_devices: Dict, new_devices: Dict) -> List[VersionChange]:
        changes = []
        for device_id in new_devices:
            if device_id not in old_devices:
                changes.append(VersionChange(
                    change_type=VersionChangeType.DEVICE_ADD,
                    target=device_id,
                    new_value=new_devices[device_id].get("device_name", device_id),
                    description=f"新增设备: {new_devices[device_id].get('device_name', device_id)}"
                ))
            else:
                old_tags = old_devices[device_id].get("tags", {})
                new_tags = new_devices[device_id].get("tags", {})
                for tag_name in new_tags:
                    if tag_name not in old_tags:
                        changes.append(VersionChange(
                            change_type=VersionChangeType.TAG_ADD,
                            target=f"{device_id}.{tag_name}",
                            new_value=new_tags[tag_name],
                            description=f"新增点位: {tag_name}"
                        ))
                    elif old_tags[tag_name] != new_tags[tag_name]:
                        changes.append(VersionChange(
                            change_type=VersionChangeType.TAG_MODIFY,
                            target=f"{device_id}.{tag_name}",
                            old_value=old_tags[tag_name],
                            new_value=new_tags[tag_name],
                            description=f"修改点位: {tag_name}"
                        ))
                for tag_name in old_tags:
                    if tag_name not in new_tags:
                        changes.append(VersionChange(
                            change_type=VersionChangeType.TAG_REMOVE,
                            target=f"{device_id}.{tag_name}",
                            old_value=old_tags[tag_name],
                            description=f"删除点位: {tag_name}"
                        ))
        for device_id in old_devices:
            if device_id not in new_devices:
                changes.append(VersionChange(
                    change_type=VersionChangeType.DEVICE_REMOVE,
                    target=device_id,
                    old_value=old_devices[device_id].get("device_name", device_id),
                    description=f"删除设备: {old_devices[device_id].get('device_name', device_id)}"
                ))
        return changes

    def _compare_scripts(self, old_scripts: Dict, new_scripts: Dict) -> List[VersionChange]:
        changes = []
        for name in new_scripts:
            if name not in old_scripts:
                changes.append(VersionChange(
                    change_type=VersionChangeType.SCRIPT_ADD,
                    target=name,
                    description=f"新增脚本: {name}"
                ))
            elif old_scripts[name] != new_scripts[name]:
                changes.append(VersionChange(
                    change_type=VersionChangeType.SCRIPT_MODIFY,
                    target=name,
                    description=f"修改脚本: {name}"
                ))
        for name in old_scripts:
            if name not in new_scripts:
                changes.append(VersionChange(
                    change_type=VersionChangeType.SCRIPT_REMOVE,
                    target=name,
                    description=f"删除脚本: {name}"
                ))
        return changes

    def _compare_parameters(self, old_params: Dict, new_params: Dict) -> List[VersionChange]:
        changes = []
        for key in new_params:
            if key not in old_params:
                changes.append(VersionChange(
                    change_type=VersionChangeType.MODIFY,
                    target=f"parameter.{key}",
                    new_value=new_params[key],
                    description=f"新增参数: {key}"
                ))
            elif old_params[key] != new_params[key]:
                changes.append(VersionChange(
                    change_type=VersionChangeType.MODIFY,
                    target=f"parameter.{key}",
                    old_value=old_params[key],
                    new_value=new_params[key],
                    description=f"修改参数: {key}"
                ))
        return changes

    def restore_version(self, version_id: str, restore_path: str = None) -> bool:
        version = self._get_version_by_id(version_id)
        if not version:
            return False
        if not Path(version.file_path).exists():
            return False
        target_path = restore_path or self._project_path
        try:
            shutil.copy2(version.file_path, target_path)
            return True
        except Exception as e:
            print(f"Restore version error: {e}")
            return False

    def get_version_diff_text(self, version1_id: str, version2_id: str) -> str:
        v1 = self._get_version_by_id(version1_id)
        v2 = self._get_version_by_id(version2_id)
        if not v1 or not v2:
            return ""
        try:
            with open(v1.file_path, 'r', encoding='utf-8') as f:
                lines1 = f.readlines()
            with open(v2.file_path, 'r', encoding='utf-8') as f:
                lines2 = f.readlines()
            diff = difflib.unified_diff(
                lines1, lines2,
                fromfile=f"Version {v1.version_number}",
                tofile=f"Version {v2.version_number}",
                lineterm=""
            )
            return '\n'.join(list(diff))
        except Exception as e:
            return f"Error generating diff: {e}"

    def delete_version(self, version_id: str) -> bool:
        version = self._get_version_by_id(version_id)
        if not version:
            return False
        try:
            if Path(version.file_path).exists():
                Path(version.file_path).unlink()
            self._versions = [v for v in self._versions if v.version_id != version_id]
            self._save_versions()
            return True
        except Exception as e:
            print(f"Delete version error: {e}")
            return False

    def get_versions(self) -> List[ProjectVersion]:
        return list(self._versions)

    def get_latest_version(self) -> Optional[ProjectVersion]:
        return self._versions[-1] if self._versions else None

    def export_version(self, version_id: str, export_path: str) -> bool:
        version = self._get_version_by_id(version_id)
        if not version or not Path(version.file_path).exists():
            return False
        try:
            shutil.copy2(version.file_path, export_path)
            return True
        except Exception as e:
            print(f"Export version error: {e}")
            return False
