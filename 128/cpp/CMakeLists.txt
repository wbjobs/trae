cmake_minimum_required(VERSION 3.15)
project(fall_detection_edge)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(OpenCV REQUIRED)
find_package(yaml-cpp REQUIRED)
find_package(Eigen3 REQUIRED)

set(MEDIAPIPE_DIR "$ENV{MEDIAPIPE_DIR}" CACHE PATH "MediaPipe installation directory")
set(TENSORFLOW_DIR "$ENV{TENSORFLOW_DIR}" CACHE PATH "TensorFlow Lite installation directory")
set(PAHO_MQTT_DIR "$ENV{PAHO_MQTT_DIR}" CACHE PATH "Paho MQTT installation directory")
set(NLOHMANN_JSON_DIR "$ENV{NLOHMANN_JSON_DIR}" CACHE PATH "Nlohmann JSON installation directory")

include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${OpenCV_INCLUDE_DIRS}
    ${YAML_CPP_INCLUDE_DIR}
    ${EIGEN3_INCLUDE_DIR}
    ${MEDIAPIPE_DIR}
    ${TENSORFLOW_DIR}
    ${PAHO_MQTT_DIR}/include
    ${NLOHMANN_JSON_DIR}/include
)

link_directories(
    ${MEDIAPIPE_DIR}/mediapipe/tasks/cc/vision/pose_landmarker
    ${MEDIAPIPE_DIR}/mediapipe/tasks/cc/vision/core
    ${MEDIAPIPE_DIR}/mediapipe/tasks/cc/core
    ${TENSORFLOW_DIR}/tensorflow/lite/tools/make/gen/linux_x86_64/lib
    ${PAHO_MQTT_DIR}/lib
)

set(SOURCES
    src/main.cpp
    src/config_parser.cpp
    src/pose_detector.cpp
    src/lstm_classifier.cpp
    src/mqtt_publisher.cpp
    src/fall_detector.cpp
    src/multi_camera_capture.cpp
    src/pose_fusion_engine.cpp
)

set(HEADERS
    include/config_parser.h
    include/pose_detector.h
    include/lstm_classifier.h
    include/mqtt_publisher.h
    include/fall_detector.h
    include/multi_camera_capture.h
    include/pose_fusion_engine.h
)

add_executable(fall_detection_edge ${SOURCES} ${HEADERS})

target_link_libraries(fall_detection_edge
    ${OpenCV_LIBS}
    yaml-cpp
    Eigen3::Eigen
    mediapipe_tasks_vision_pose_landmarker
    mediapipe_tasks_vision_core
    mediapipe_tasks_core
    tensorflowlite
    paho-mqttpp3
    paho-mqtt3a
)

if(WIN32)
    target_link_libraries(fall_detection_edge ws2_32)
endif()

install(TARGETS fall_detection_edge DESTINATION bin)
