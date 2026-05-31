from typing import Optional
from PyQt5.QtWidgets import QComboBox, QWidget
from PyQt5.QtCore import pyqtSignal


class ProfileSelector(QComboBox):
    profile_selected = pyqtSignal(str)

    def __init__(self, profile_manager=None, parent=None):
        super().__init__(parent)
        self._profile_manager = profile_manager
        self.currentIndexChanged.connect(self._on_index_changed)
        self.refresh()

    def refresh(self) -> None:
        self.blockSignals(True)
        self.clear()

        if not self._profile_manager:
            self.blockSignals(False)
            return

        active_profile = self._profile_manager.get_active_profile()
        active_id = active_profile.profile_id if active_profile else None

        for profile in self._profile_manager.get_all_profiles():
            label = profile.name
            if profile.is_default:
                label += ' (默认)'
            self.addItem(label, profile.profile_id)
            if profile.profile_id == active_id:
                self.setCurrentIndex(self.count() - 1)

        self.blockSignals(False)

    def _on_index_changed(self, index: int) -> None:
        if index >= 0:
            profile_id = self.itemData(index)
            if profile_id:
                self.profile_selected.emit(profile_id)
