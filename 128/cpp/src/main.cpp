#include <iostream>
#include <string>
#include <csignal>
#include <memory>
#include "fall_detector.h"

std::unique_ptr<FallDetector> g_fall_detector = nullptr;

void signalHandler(int signal) {
    std::cout << "\nReceived signal " << signal << ", shutting down..." << std::endl;
    if (g_fall_detector) {
        g_fall_detector->stop();
    }
}

int main(int argc, char* argv[]) {
    std::string config_path = "../config/config.yaml";
    
    if (argc > 1) {
        config_path = argv[1];
    }
    
    std::cout << "Fall Detection Edge Service" << std::endl;
    std::cout << "==========================" << std::endl;
    std::cout << "Config file: " << config_path << std::endl;
    
    signal(SIGINT, signalHandler);
    signal(SIGTERM, signalHandler);
    
    try {
        g_fall_detector = std::make_unique<FallDetector>(config_path);
        g_fall_detector->run();
    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << std::endl;
        return 1;
    }
    
    std::cout << "Service stopped." << std::endl;
    return 0;
}
