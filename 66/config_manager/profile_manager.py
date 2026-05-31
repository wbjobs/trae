import os
import json
import uuid
import time
import threading
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field
import logging

from .config_store import JsonConfigStore

logger = logging.getLogger(__name__)


@dataclass
class ControlProfile:
    profile_id: str
    name: str
    description: str = ''
    icon: str = ''
    devices: List[Dict[str, Any]] = field(default_factory=list)
    commands: List[Dict[str, Any]] = field(default_factory=list)
    linkages: List[Dict[str, Any]] = field(default_factory=list)
    ui_layout: Dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    is_default: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            'profile_id': self.profile_id,
            'name': self.name,
            'description': self.description,
            'icon': self.icon,
            'devices': self.devices,
            'commands': self.commands,
            'linkages': self.linkages,
            'ui_layout': self.ui_layout,
            'created_at': self.created_at,
            'updated_at': self.updated_at,
            'is_default': self.is_default
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ControlProfile':
        return cls(
            profile_id=data['profile_id'],
            name=data['name'],
            description=data.get('description', ''),
            icon=data.get('icon', ''),
            devices=data.get('devices', []),
            commands=data.get('commands', []),
            linkages=data.get('linkages', []),
            ui_layout=data.get('ui_layout', {}),
            created_at=data.get('created_at', time.time()),
            updated_at=data.get('updated_at', time.time()),
            is_default=data.get('is_default', False)
        )


class ProfileManager:
    def __init__(self, profiles_dir: str):
        self._store = JsonConfigStore(profiles_dir)
        self._lock = threading.RLock()
        self._profiles: Dict[str, ControlProfile] = {}
        self._active_profile_id: Optional[str] = None
        self._on_profile_activated: Optional[callable] = None
        self._load_all_profiles()

    def set_on_profile_activated(self, callback) -> None:
        self._on_profile_activated = callback

    def _load_all_profiles(self) -> None:
        with self._lock:
            self._profiles.clear()
            files = self._store.list_files('.json')
            for filename in files:
                try:
                    data = self._store.load(filename)
                    if data and 'profile_id' in data:
                        profile = ControlProfile.from_dict(data)
                        self._profiles[profile.profile_id] = profile
                        if profile.is_default:
                            self._active_profile_id = profile.profile_id
                except Exception as e:
                    logger.error(f'Load profile {filename} error: {e}')

            logger.info(f'Loaded {len(self._profiles)} profiles')

    def create_profile(self, name: str, description: str = '') -> ControlProfile:
        with self._lock:
            profile = ControlProfile(
                profile_id=str(uuid.uuid4()),
                name=name,
                description=description
            )
            self._profiles[profile.profile_id] = profile
            self._save_profile(profile)
            logger.info(f'Profile created: {profile.profile_id} - {name}')
            return profile

    def delete_profile(self, profile_id: str) -> bool:
        with self._lock:
            if profile_id not in self._profiles:
                return False

            if self._profiles[profile_id].is_default:
                logger.warning('Cannot delete default profile')
                return False

            filename = f'{profile_id}.json'
            if self._store.delete(filename):
                del self._profiles[profile_id]
                if self._active_profile_id == profile_id:
                    self._active_profile_id = None
                logger.info(f'Profile deleted: {profile_id}')
                return True
            return False

    def get_profile(self, profile_id: str) -> Optional[ControlProfile]:
        with self._lock:
            return self._profiles.get(profile_id)

    def get_all_profiles(self) -> List[ControlProfile]:
        with self._lock:
            return list(self._profiles.values())

    def update_profile(self, profile_id: str, updated_data: Dict[str, Any]) -> bool:
        with self._lock:
            profile = self._profiles.get(profile_id)
            if not profile:
                return False

            for key, value in updated_data.items():
                if hasattr(profile, key):
                    setattr(profile, key, value)

            profile.updated_at = time.time()
            self._save_profile(profile)
            logger.info(f'Profile updated: {profile_id}')
            return True

    def activate_profile(self, profile_id: str) -> bool:
        with self._lock:
            if profile_id not in self._profiles:
                return False

            for pid, profile in self._profiles.items():
                profile.is_default = (pid == profile_id)
                self._save_profile(profile)

            self._active_profile_id = profile_id
            logger.info(f'Profile activated: {profile_id}')

            if self._on_profile_activated:
                try:
                    self._on_profile_activated(self._profiles[profile_id])
                except Exception as e:
                    logger.error(f'Profile activated callback error: {e}')

            return True

    def get_active_profile(self) -> Optional[ControlProfile]:
        with self._lock:
            if self._active_profile_id:
                return self._profiles.get(self._active_profile_id)

            for profile in self._profiles.values():
                if profile.is_default:
                    self._active_profile_id = profile.profile_id
                    return profile

            if self._profiles:
                return next(iter(self._profiles.values()))

            return None

    def duplicate_profile(self, profile_id: str, new_name: str) -> Optional[ControlProfile]:
        with self._lock:
            source = self._profiles.get(profile_id)
            if not source:
                return None

            new_profile = ControlProfile(
                profile_id=str(uuid.uuid4()),
                name=new_name,
                description=source.description,
                icon=source.icon,
                devices=[dict(d) for d in source.devices],
                commands=[dict(c) for c in source.commands],
                linkages=[dict(l) for l in source.linkages],
                ui_layout=dict(source.ui_layout) if source.ui_layout else {},
                is_default=False
            )

            self._profiles[new_profile.profile_id] = new_profile
            self._save_profile(new_profile)
            logger.info(f'Profile duplicated: {profile_id} -> {new_profile.profile_id}')
            return new_profile

    def export_profile(self, profile_id: str, export_path: str) -> bool:
        with self._lock:
            profile = self._profiles.get(profile_id)
            if not profile:
                return False

            try:
                with open(export_path, 'w', encoding='utf-8') as f:
                    json.dump(profile.to_dict(), f, ensure_ascii=False, indent=2)
                return True
            except Exception as e:
                logger.error(f'Export profile error: {e}')
                return False

    def import_profile(self, import_path: str) -> Optional[ControlProfile]:
        try:
            with open(import_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            if 'profile_id' not in data:
                return None

            data['profile_id'] = str(uuid.uuid4())
            data['is_default'] = False
            profile = ControlProfile.from_dict(data)

            with self._lock:
                self._profiles[profile.profile_id] = profile
                self._save_profile(profile)

            logger.info(f'Profile imported: {profile.profile_id}')
            return profile
        except Exception as e:
            logger.error(f'Import profile error: {e}')
            return None

    def _save_profile(self, profile: ControlProfile) -> None:
        filename = f'{profile.profile_id}.json'
        self._store.save(filename, profile.to_dict())
