cmake_minimum_required(VERSION 3.10)
project(DocumentCorrectionSDK)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

option(BUILD_ANDROID "Build for Android" OFF)
option(WITH_FASTDEPLOY "Enable FastDeploy" ON)
option(WITH_OPENCV "Enable OpenCV" ON)

if(BUILD_ANDROID)
    set(ANDROID_ABI "arm64-v8a" CACHE STRING "Android ABI")
    set(ANDROID_PLATFORM "android-24" CACHE STRING "Android platform")
endif()

if(WITH_OPENCV)
    find_package(OpenCV REQUIRED)
    include_directories(${OpenCV_INCLUDE_DIRS})
endif()

if(WITH_FASTDEPLOY)
    if(DEFINED ENV{FASTDEPLOY_DIR})
        set(FASTDEPLOY_DIR $ENV{FASTDEPLOY_DIR})
    endif()
    if(FASTDEPLOY_DIR)
        include_directories(${FASTDEPLOY_DIR}/include)
        link_directories(${FASTDEPLOY_DIR}/lib)
    endif()
    add_definitions(-DWITH_FASTDEPLOY)
endif()

include_directories(
    ${CMAKE_SOURCE_DIR}/cpp/include
    ${CMAKE_SOURCE_DIR}/cpp/src
)

set(CPP_SOURCES
    cpp/src/document_detector.cpp
    cpp/src/perspective_transformer.cpp
    cpp/src/document_correction.cpp
    cpp/src/batch_processor.cpp
)

if(BUILD_ANDROID)
    find_library(log-lib log)
    find_library(jnigraphics-lib jnigraphics)

    add_library(document_correction SHARED
        ${CPP_SOURCES}
        jni/document_correction_jni.cpp
    )

    target_link_libraries(document_correction
        ${log-lib}
        ${jnigraphics-lib}
        ${OpenCV_LIBS}
        fastdeploy
        paddle_light_api
    )
else()
    add_library(document_correction SHARED ${CPP_SOURCES})
    target_link_libraries(document_correction ${OpenCV_LIBS})

    if(WITH_FASTDEPLOY)
        target_link_libraries(document_correction fastdeploy paddle_light_api)
    endif()
endif()

add_library(document_correction_static STATIC ${CPP_SOURCES})
target_link_libraries(document_correction_static ${OpenCV_LIBS})

if(WITH_FASTDEPLOY)
    target_link_libraries(document_correction_static fastdeploy paddle_light_api)
endif()

if(NOT BUILD_ANDROID)
    add_executable(test_correction examples/cpp/test_correction.cpp)
    target_link_libraries(test_correction document_correction)
endif()
