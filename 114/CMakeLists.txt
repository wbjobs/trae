cmake_minimum_required(VERSION 3.16)
project(rv32im_sim VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

set(CMAKE_CXX_FLAGS_DEBUG "-g -O0 -DDEBUG")
set(CMAKE_CXX_FLAGS_RELEASE "-O3 -DNDEBUG")

find_package(PkgConfig)
if(PkgConfig_FOUND)
    pkg_check_modules(LIBELF libelf)
endif()

find_library(ELF_LIBRARY
    NAMES elf
    PATHS /usr/lib /usr/local/lib /lib
)

find_path(ELF_INCLUDE_DIR
    NAMES libelf.h gelf.h
    PATHS /usr/include /usr/local/include /usr/include/libelf
)

if(NOT ELF_LIBRARY OR NOT ELF_INCLUDE_DIR)
    message(FATAL_ERROR "libelf not found. Install libelf-dev or equivalent.")
endif()

message(STATUS "libelf library: ${ELF_LIBRARY}")
message(STATUS "libelf include: ${ELF_INCLUDE_DIR}")

add_executable(rv32im_sim
    src/main.cpp
    src/elf_loader.cpp
    src/cpu_state.cpp
    src/decoder.cpp
    src/executor.cpp
    src/stats.cpp
    src/flame_graph.cpp
    src/gdb_server.cpp
    src/loop_detector.cpp
    src/superscalar.cpp
)

target_include_directories(rv32im_sim PRIVATE
    ${CMAKE_SOURCE_DIR}/src
    ${ELF_INCLUDE_DIR}
)

target_link_libraries(rv32im_sim PRIVATE ${ELF_LIBRARY})

if(WIN32)
    target_link_libraries(rv32im_sim PRIVATE ws2_32)
endif()

install(TARGETS rv32im_sim DESTINATION bin)
