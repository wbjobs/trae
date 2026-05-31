import os
import importlib.util
import logging
from typing import Dict, Any, Optional, List, Type
from abc import ABC, abstractmethod

from .driver_adapter import DriverAdapter

logger = logging.getLogger(__name__)


class DriverInfo:
    def __init__(self, name: str, driver_class: Type[DriverAdapter], description: str = '', version: str = '1.0'):
        self.name = name
        self.driver_class = driver_class
        self.description = description
        self.version = version


class DriverManager:
    def __init__(self, drivers_dir: str = None):
        self._drivers: Dict[str, DriverInfo] = {}
        self._drivers_dir = drivers_dir
        self._register_builtin_drivers()
        if self._drivers_dir:
            self._load_external_drivers()

    def _register_builtin_drivers(self) -> None:
        from .driver_adapter import SerialDriver, NetworkDriver, USBDriver

        self._drivers['serial'] = DriverInfo(
            name='serial',
            driver_class=SerialDriver,
            description='串口通信驱动 (RS232/RS485)',
            version='1.0'
        )
        self._drivers['network'] = DriverInfo(
            name='network',
            driver_class=NetworkDriver,
            description='网络通信驱动 (TCP/UDP)',
            version='1.0'
        )
        self._drivers['usb'] = DriverInfo(
            name='usb',
            driver_class=USBDriver,
            description='USB设备驱动',
            version='1.0'
        )
        logger.info('Built-in drivers registered')

    def _load_external_drivers(self) -> None:
        if not self._drivers_dir or not os.path.exists(self._drivers_dir):
            return

        for filename in os.listdir(self._drivers_dir):
            if filename.endswith('.py') and not filename.startswith('_'):
                try:
                    self._load_driver_file(os.path.join(self._drivers_dir, filename))
                except Exception as e:
                    logger.error(f'Failed to load driver {filename}: {e}')

    def _load_driver_file(self, file_path: str) -> None:
        module_name = os.path.splitext(os.path.basename(file_path))[0]
        spec = importlib.util.spec_from_file_location(module_name, file_path)
        if spec and spec.loader:
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            for attr_name in dir(module):
                attr = getattr(module, attr_name)
                if (isinstance(attr, type) and
                    issubclass(attr, DriverAdapter) and
                    attr is not DriverAdapter):
                    driver_name = getattr(attr, 'DRIVER_NAME', module_name.lower())
                    description = getattr(attr, 'DESCRIPTION', '')
                    version = getattr(attr, 'VERSION', '1.0')

                    self._drivers[driver_name] = DriverInfo(
                        name=driver_name,
                        driver_class=attr,
                        description=description,
                        version=version
                    )
                    logger.info(f'External driver loaded: {driver_name} v{version}')

    def get_driver(self, driver_type: str, device_id: str, **kwargs) -> Optional[DriverAdapter]:
        driver_info = self._drivers.get(driver_type.lower())
        if not driver_info:
            logger.error(f'Driver not found: {driver_type}')
            return None

        try:
            return driver_info.driver_class(device_id, **kwargs)
        except Exception as e:
            logger.error(f'Failed to create driver {driver_type}: {e}')
            return None

    def get_available_drivers(self) -> List[Dict[str, str]]:
        return [
            {
                'name': info.name,
                'description': info.description,
                'version': info.version
            }
            for info in self._drivers.values()
        ]

    def register_driver(self, name: str, driver_class: Type[DriverAdapter],
                        description: str = '', version: str = '1.0') -> None:
        self._drivers[name.lower()] = DriverInfo(
            name=name.lower(),
            driver_class=driver_class,
            description=description,
            version=version
        )
        logger.info(f'Driver registered: {name} v{version}')

    def has_driver(self, driver_type: str) -> bool:
        return driver_type.lower() in self._drivers
