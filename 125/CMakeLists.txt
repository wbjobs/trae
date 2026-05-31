cmake_minimum_required(VERSION 3.15)
project(terrain_destruction LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# Godot CPP binding paths (adjust these to match your setup)
set(GODOT_CPP_PATH "${CMAKE_CURRENT_SOURCE_DIR}/godot-cpp" CACHE PATH "Path to godot-cpp bindings")

# Output directory
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/bin)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/bin)

# Source files
set(TERRAIN_DESTRUCTION_SOURCES
    src/register_types.cpp
    src/terrain/terrain_data.cpp
    src/terrain/terrain_mesh.cpp
    src/terrain/terrain_chunk.cpp
    src/terrain/terrain_world.cpp
    src/explosive/explosive.cpp
    src/explosive/volume_tracker.cpp
)

set(TERRAIN_DESTRUCTION_HEADERS
    src/register_types.h
    src/terrain/terrain_data.h
    src/terrain/terrain_mesh.h
    src/terrain/terrain_chunk.h
    src/terrain/terrain_world.h
    src/explosive/explosive.h
    src/explosive/volume_tracker.h
)

# Find Threads
find_package(Threads REQUIRED)

# Create the shared library
add_library(terrain_destruction SHARED
    ${TERRAIN_DESTRUCTION_SOURCES}
    ${TERRAIN_DESTRUCTION_HEADERS}
)

target_include_directories(terrain_destruction PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src
    ${GODOT_CPP_PATH}/include
    ${GODOT_CPP_PATH}/build
    ${GODOT_CPP_PATH}/gdextension
)

# Link godot-cpp library
target_link_libraries(terrain_destruction PRIVATE
    Threads::Threads
)

# Platform-specific configuration
if(CMAKE_SYSTEM_NAME STREQUAL "Windows")
    target_link_libraries(terrain_destruction PRIVATE
        ${GODOT_CPP_PATH}/bin/libgodot-cpp.windows.release.x86_64.lib
    )
    set_target_properties(terrain_destruction PROPERTIES
        OUTPUT_NAME "libterrain_destruction.windows.${CMAKE_BUILD_TYPE}.x86_64"
        SUFFIX ".dll"
    )
elseif(CMAKE_SYSTEM_NAME STREQUAL "Linux")
    target_link_libraries(terrain_destruction PRIVATE
        ${GODOT_CPP_PATH}/bin/libgodot-cpp.linux.release.x86_64.a
    )
    set_target_properties(terrain_destruction PROPERTIES
        OUTPUT_NAME "libterrain_destruction.linux.${CMAKE_BUILD_TYPE}.x86_64"
        SUFFIX ".so"
    )
elseif(CMAKE_SYSTEM_NAME STREQUAL "Darwin")
    target_link_libraries(terrain_destruction PRIVATE
        ${GODOT_CPP_PATH}/bin/libgodot-cpp.macos.release.a
    )
    set_target_properties(terrain_destruction PROPERTIES
        OUTPUT_NAME "libterrain_destruction.macos.${CMAKE_BUILD_TYPE}"
        SUFFIX ".dylib"
    )
endif()

# Install
install(TARGETS terrain_destruction
    LIBRARY DESTINATION bin
    RUNTIME DESTINATION bin
)

# Custom target to copy built library
add_custom_command(TARGET terrain_destruction POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory
        ${CMAKE_BINARY_DIR}/bin
        ${CMAKE_SOURCE_DIR}/bin
)
