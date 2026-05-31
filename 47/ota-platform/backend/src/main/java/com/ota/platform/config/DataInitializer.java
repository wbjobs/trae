package com.ota.platform.config;

import com.ota.platform.entity.Device;
import com.ota.platform.entity.DeviceGroup;
import com.ota.platform.entity.User;
import com.ota.platform.repository.DeviceGroupRepository;
import com.ota.platform.repository.DeviceRepository;
import com.ota.platform.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
public class DataInitializer implements CommandLineRunner {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private DeviceRepository deviceRepository;

    @Autowired
    private DeviceGroupRepository deviceGroupRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) {
        if (!userRepository.existsByUsername("admin")) {
            User admin = new User();
            admin.setUsername("admin");
            admin.setPassword(passwordEncoder.encode("admin123"));
            admin.setEmail("admin@ota-platform.com");
            admin.setRealName("System Administrator");
            admin.setRole("ADMIN");
            admin.setIsEnabled(true);
            userRepository.save(admin);
        }

        if (!userRepository.existsByUsername("user")) {
            User user = new User();
            user.setUsername("user");
            user.setPassword(passwordEncoder.encode("user123"));
            user.setEmail("user@ota-platform.com");
            user.setRealName("Normal User");
            user.setRole("USER");
            user.setIsEnabled(true);
            userRepository.save(user);
        }

        if (deviceGroupRepository.count() == 0) {
            DeviceGroup group1 = new DeviceGroup();
            group1.setName("Production Devices");
            group1.setDescription("Production environment devices");
            deviceGroupRepository.save(group1);

            DeviceGroup group2 = new DeviceGroup();
            group2.setName("Test Devices");
            group2.setDescription("Test environment devices");
            deviceGroupRepository.save(group2);

            DeviceGroup group3 = new DeviceGroup();
            group3.setName("Development Devices");
            group3.setDescription("Development environment devices");
            deviceGroupRepository.save(group3);

            for (int i = 1; i <= 15; i++) {
                Device device = new Device();
                device.setDeviceId("DEV-" + String.format("%04d", i));
                device.setName("Device " + i);
                device.setDescription("Sample device " + i);
                device.setModel("EMB-MODEL-" + (i % 3 + 1));
                device.setManufacturer("OTA Manufacturer");
                device.setFirmwareVersion("1.0." + (i % 5));
                device.setHardwareVersion("HW-V1.0");
                device.setSerialNumber("SN-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
                device.setMacAddress("00:1A:2B:" + String.format("%02X:%02X:%02X", i, i + 1, i + 2));
                device.setIpAddress("192.168.1." + (100 + i));
                device.setStatus(i % 3 == 0 ? "OFFLINE" : "ONLINE");
                device.setApiKey(UUID.randomUUID().toString().replace("-", ""));
                device.setIsActive(true);
                if (i <= 5) {
                    device.setGroup(group1);
                    group1.setDeviceCount(group1.getDeviceCount() + 1);
                } else if (i <= 10) {
                    device.setGroup(group2);
                    group2.setDeviceCount(group2.getDeviceCount() + 1);
                } else {
                    device.setGroup(group3);
                    group3.setDeviceCount(group3.getDeviceCount() + 1);
                }
                if ("ONLINE".equals(device.getStatus())) {
                    device.setLastHeartbeat(java.time.LocalDateTime.now());
                }
                deviceRepository.save(device);
            }

            deviceGroupRepository.save(group1);
            deviceGroupRepository.save(group2);
            deviceGroupRepository.save(group3);
        }
    }
}
