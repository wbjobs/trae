cmake_minimum_required(VERSION 3.18)
project(astro_stack LANGUAGES CXX CUDA)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CUDA_STANDARD 17)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

option(ASTRO_STACK_BUILD_PYTHON "Build Python bindings" ON)
option(ASTRO_STACK_USE_CUDA "Use CUDA acceleration" ON)

find_package(CUDA REQUIRED)
find_package(Python3 COMPONENTS Interpreter Development)

set(CFITSIO_ROOT "" CACHE PATH "Path to cfitsio installation")
find_path(CFITSIO_INCLUDE_DIR fitsio.h HINTS ${CFITSIO_ROOT}/include)
find_library(CFITSIO_LIBRARY cfitsio HINTS ${CFITSIO_ROOT}/lib)

if(NOT CFITSIO_INCLUDE_DIR OR NOT CFITSIO_LIBRARY)
    message(FATAL_ERROR "cfitsio not found. Set CFITSIO_ROOT.")
endif()

set(PYBIND11_ROOT "" CACHE PATH "Path to pybind11 installation")
if(NOT TARGET pybind11::module)
    find_package(pybind11 REQUIRED HINTS ${PYBIND11_ROOT})
endif()

set(ASTRO_STACK_SOURCES
    src/core/fits_reader.cpp
    src/core/cross_correlation.cpp
    src/core/stacker.cpp
)

set(ASTRO_STACK_CUDA_SOURCES
    src/cuda/cross_correlation.cu
)

add_library(astro_stack_core STATIC
    ${ASTRO_STACK_SOURCES}
    ${ASTRO_STACK_CUDA_SOURCES}
)

target_include_directories(astro_stack_core PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CFITSIO_INCLUDE_DIR}
    ${CUDA_INCLUDE_DIRS}
)

target_link_libraries(astro_stack_core PUBLIC
    ${CFITSIO_LIBRARY}
    CUDA::cudart
    CUDA::cufft
)

set_target_properties(astro_stack_core PROPERTIES
    CUDA_SEPARABLE_COMPILATION ON
)

if(ASTRO_STACK_BUILD_PYTHON)
    pybind11_add_module(astro_stack
        src/bindings/py_bindings.cpp
    )
    target_link_libraries(astro_stack PRIVATE astro_stack_core)
    target_include_directories(astro_stack PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/include
    )
    set_target_properties(astro_stack PROPERTIES
        LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/python
    )
endif()
