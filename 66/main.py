import sys
import os
import logging
from typing import Dict, Any

from PyQt5.QtWidgets import QApplication
from PyQt5.QtCore import Qt

from platform_adapter import platform
from peripheral_adapter import DeviceManager
from command_editor import CommandManager
from device_scheduler import TaskScheduler, LinkageEngine
from config_manager import JsonConfigStore, AppConfig, ProfileManager, CacheManager
from ui import MainWindow


def setup_logging(log_level: str = 'INFO') -> None:
    log_dir = os.path.join(platform.get_app_data_dir(), 'logs')
    os.makedirs(log_dir, exist_ok=True)
    log_file = os.path.join(log_dir, 'app.log')

    numeric_level = getattr(logging, log_level.upper(), logging.INFO)

    logging.basicConfig(
        level=numeric_level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(log_file, encoding='utf-8'),
            logging.StreamHandler(sys.stdout)
        ]
    )


class Application:
    def __init__(self):
        self._app_data_dir = platform.get_app_data_dir()
        self._config_dir = os.path.join(self._app_data_dir, 'config')
        self._profiles_dir = os.path.join(self._app_data_dir, 'profiles')
        self._cache_dir = os.path.join(self._app_data_dir, 'cache')
        self._drivers_dir = os.path.join(self._app_data_dir, 'drivers')
        self._layouts_dir = os.path.join(self._app_data_dir, 'layouts')

        for dir_path in [self._config_dir, self._profiles_dir, self._cache_dir,
                         self._drivers_dir, self._layouts_dir]:
            os.makedirs(dir_path, exist_ok=True)

        self._config_store = JsonConfigStore(self._config_dir)
        self._config = AppConfig(self._config_store)

        config_data = self._config.load()
        setup_logging(config_data.get('advanced', {}).get('log_level', 'INFO'))

        self._logger = logging.getLogger(__name__)
        self._logger.info('Initializing Desktop Control Center...')

        self._profile_manager = ProfileManager(self._profiles_dir)
        self._cache_manager = CacheManager(self._cache_dir)

        self._device_manager = DeviceManager()
        self._command_manager = CommandManager(self._device_manager)
        self._scheduler = TaskScheduler(self._device_manager)
        self._linkage_engine = LinkageEngine(self._device_manager, self._command_manager, self._scheduler)

        self._command_manager.set_device_manager(self._device_manager)
        self._linkage_engine.set_device_manager(self._device_manager)
        self._linkage_engine.set_command_manager(self._command_manager)
        self._linkage_engine.set_scheduler(self._scheduler)

        self._load_active_profile()

        self._app = QApplication(sys.argv)
        self._app.setApplicationName('桌面中控应用')
        self._app.setOrganizationName('DesktopControlCenter')

        self._main_window = None

    def _load_active_profile(self) -> None:
        active_profile = self._profile_manager.get_active_profile()
        if not active_profile:
            self._logger.info('No active profile found, creating default profile')
            active_profile = self._profile_manager.create_profile('默认方案', '初始控制方案')
            active_profile.is_default = True
            self._profile_manager.update_profile(active_profile.profile_id, {'is_default': True})

        self._logger.info(f'Loading profile: {active_profile.name}')
        self._load_devices_from_profile(active_profile)
        self._load_commands_from_profile(active_profile)
        self._load_linkages_from_profile(active_profile)

    def _load_devices_from_profile(self, profile) -> None:
        from peripheral_adapter import PeripheralDevice

        for device_data in profile.devices:
            try:
                device = PeripheralDevice.from_dict(device_data)
                self._device_manager.add_device(device)
                self._logger.info(f'Loaded device: {device.name}')
            except Exception as e:
                self._logger.error(f'Failed to load device: {e}')

    def _load_commands_from_profile(self, profile) -> None:
        from command_editor import Command

        for command_data in profile.commands:
            try:
                command = Command.from_dict(command_data)
                self._command_manager.add_command(command)
                self._logger.info(f'Loaded command: {command.name}')
            except Exception as e:
                self._logger.error(f'Failed to load command: {e}')

    def _load_linkages_from_profile(self, profile) -> None:
        from device_scheduler import LinkageRule

        for linkage_data in profile.linkages:
            try:
                linkage = LinkageRule.from_dict(linkage_data)
                self._linkage_engine.add_rule(linkage)
                self._logger.info(f'Loaded linkage: {linkage.name}')
            except Exception as e:
                self._logger.error(f'Failed to load linkage: {e}')

    def _save_to_profile(self) -> None:
        active_profile = self._profile_manager.get_active_profile()
        if not active_profile:
            return

        devices_data = [d.to_dict() for d in self._device_manager.get_all_devices()]
        commands_data = [c.to_dict() for c in self._command_manager.get_all_commands()]
        linkages_data = [l.to_dict() for l in self._linkage_engine.get_all_rules()]

        self._profile_manager.update_profile(
            active_profile.profile_id,
            {
                'devices': devices_data,
                'commands': commands_data,
                'linkages': linkages_data
            }
        )
        self._logger.info('Profile saved')

    def run(self) -> int:
        try:
            self._device_manager.start_monitor()
            self._scheduler.start()
            self._linkage_engine.start()

            app_context = {
                'device_manager': self._device_manager,
                'command_manager': self._command_manager,
                'scheduler': self._scheduler,
                'linkage_engine': self._linkage_engine,
                'profile_manager': self._profile_manager,
                'config': self._config,
                'cache_manager': self._cache_manager
            }

            self._main_window = MainWindow(app_context)
            self._main_window.show()

            self._logger.info('Application started successfully')
            exit_code = self._app.exec_()

            self._save_to_profile()
            self._cache_manager.persist()

            self._linkage_engine.stop()
            self._scheduler.stop()
            self._device_manager.stop_monitor()

            self._logger.info('Application shutdown complete')
            return exit_code

        except Exception as e:
            self._logger.critical(f'Application failed to start: {e}', exc_info=True)
            return 1


def main() -> int:
    QApplication.setAttribute(Qt.AA_EnableHighDpiScaling, True)
    QApplication.setAttribute(Qt.AA_UseHighDpiPixmaps, True)

    app = Application()
    return app.run()


if __name__ == '__main__':
    sys.exit(main())
