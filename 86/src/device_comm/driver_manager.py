import json
import os
from typing import Dict, List, Optional, Any
from pathlib import Path
from dataclasses import dataclass, field


@dataclass
class DeviceDriver:
    driver_id: str
    manufacturer: str
    brand: str
    protocol: str
    models: Dict[str, Any] = field(default_factory=dict)
    tag_templates: Dict[str, Any] = field(default_factory=dict)
    default_tags: List[Dict[str, Any]] = field(default_factory=list)
    config_path: str = ""


class DriverManager:
    _instance = None
    _drivers: Dict[str, DeviceDriver] = {}
    _drivers_loaded = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if not self._drivers_loaded:
            self._load_drivers()
            self._drivers_loaded = True

    def _load_drivers(self):
        base_path = Path(__file__).parent.parent.parent / "drivers"
        if not base_path.exists():
            return
        for manufacturer_dir in base_path.iterdir():
            if not manufacturer_dir.is_dir():
                continue
            for config_file in manufacturer_dir.glob("*.json"):
                try:
                    driver = self._load_driver_config(config_file)
                    if driver:
                        self._drivers[driver.driver_id] = driver
                except Exception as e:
                    print(f"Load driver error {config_file}: {e}")

    def _load_driver_config(self, config_path: Path) -> Optional[DeviceDriver]:
        with open(config_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        driver_id = f"{data.get('manufacturer', 'unknown')}_{data.get('brand', 'unknown')}".lower()
        driver = DeviceDriver(
            driver_id=driver_id,
            manufacturer=data.get("manufacturer", ""),
            brand=data.get("brand", ""),
            protocol=data.get("protocol", ""),
            models=data.get("models", {}),
            tag_templates=data.get("tag_templates", {}),
            default_tags=data.get("default_tags", []),
            config_path=str(config_path)
        )
        return driver

    def get_driver(self, driver_id: str) -> Optional[DeviceDriver]:
        return self._drivers.get(driver_id.lower())

    def get_driver_by_manufacturer(self, manufacturer: str) -> List[DeviceDriver]:
        return [
            driver for driver in self._drivers.values()
            if driver.manufacturer.lower() == manufacturer.lower()
        ]

    def get_driver_by_protocol(self, protocol: str) -> List[DeviceDriver]:
        return [
            driver for driver in self._drivers.values()
            if driver.protocol.lower() == protocol.lower()
        ]

    def get_all_drivers(self) -> List[DeviceDriver]:
        return list(self._drivers.values())

    def get_manufacturers(self) -> List[str]:
        return sorted(list(set(driver.manufacturer for driver in self._drivers.values())))

    def get_brands(self, manufacturer: str = None) -> List[str]:
        if manufacturer:
            return sorted(list(set(
                driver.brand for driver in self._drivers.values()
                if driver.manufacturer.lower() == manufacturer.lower()
            )))
        return sorted(list(set(driver.brand for driver in self._drivers.values())))

    def get_models(self, driver_id: str) -> List[str]:
        driver = self._drivers.get(driver_id.lower())
        if driver:
            return sorted(list(driver.models.keys()))
        return []

    def get_model_config(self, driver_id: str, model_name: str) -> Optional[Dict[str, Any]]:
        driver = self._drivers.get(driver_id.lower())
        if driver:
            return driver.models.get(model_name)
        return None

    def get_tag_templates(self, driver_id: str) -> Dict[str, Any]:
        driver = self._drivers.get(driver_id.lower())
        if driver:
            return driver.tag_templates
        return {}

    def get_default_tags(self, driver_id: str) -> List[Dict[str, Any]]:
        driver = self._drivers.get(driver_id.lower())
        if driver:
            return driver.default_tags
        return []

    def create_device_from_template(self, driver_id: str, model_name: str,
                                   device_name: str, ip_address: str,
                                   port: int = None) -> Optional[Dict[str, Any]]:
        driver = self._drivers.get(driver_id.lower())
        if not driver:
            return None
        model_config = driver.models.get(model_name)
        if not model_config:
            return None
        import uuid
        device_config = {
            "device_id": str(uuid.uuid4()),
            "device_name": device_name,
            "protocol": driver.protocol,
            "ip_address": ip_address,
            "port": port or model_config.get("default_port", 502),
            "driver_id": driver_id,
            "model": model_name,
            "manufacturer": driver.manufacturer,
            "brand": driver.brand,
            "tags": [],
            "config": model_config
        }
        return device_config

    def generate_tags_from_template(self, driver_id: str, count: int = 10,
                                    tag_type: str = "all") -> List[Dict[str, Any]]:
        driver = self._drivers.get(driver_id.lower())
        if not driver:
            return []
        templates = driver.tag_templates
        if not templates:
            return []
        if tag_type != "all" and tag_type in templates:
            templates = {tag_type: templates[tag_type]}
        generated_tags = []
        for i in range(count):
            template_key = list(templates.keys())[i % len(templates)]
            template = templates[template_key]
            tag = {
                "name": f"{template.get('description', 'TAG')}_{i+1:03d}",
                "address": str(i),
                "point_type": template.get("point_type", "AI"),
                "data_type": template.get("data_type", "float32"),
                "description": template.get("description", ""),
                "unit": template.get("unit", ""),
                "min_value": template.get("min_value", 0),
                "max_value": template.get("max_value", 100),
                "coefficient": template.get("coefficient", 1.0),
                "offset": template.get("offset", 0.0),
                "read_only": template.get("point_type", "AI") in ["AI", "DI"],
                "group": template.get("area", "default")
            }
            generated_tags.append(tag)
        return generated_tags

    def search_drivers(self, keyword: str) -> List[DeviceDriver]:
        keyword = keyword.lower()
        results = []
        for driver in self._drivers.values():
            if (keyword in driver.manufacturer.lower() or
                keyword in driver.brand.lower() or
                keyword in driver.protocol.lower() or
                keyword in driver.driver_id.lower()):
                results.append(driver)
        return results

    def reload_drivers(self):
        self._drivers.clear()
        self._load_drivers()

    def get_driver_count(self) -> int:
        return len(self._drivers)

    def get_total_model_count(self) -> int:
        return sum(len(driver.models) for driver in self._drivers.values())
