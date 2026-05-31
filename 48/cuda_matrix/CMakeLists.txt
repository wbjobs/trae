cmake_minimum_required(VERSION 3.18)
project(cuda_matrix LANGUAGES CXX CUDA)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CUDA_STANDARD 17)
set(CMAKE_CUDA_ARCHITECTURES 75)

find_package(Python3 COMPONENTS Interpreter Development REQUIRED)

execute_process(
    COMMAND ${Python3_EXECUTABLE} -m pybind11 --cmakedir
    OUTPUT_VARIABLE pybind11_DIR
    OUTPUT_STRIP_TRAILING_WHITESPACE
)
find_package(pybind11 CONFIG REQUIRED)

include_directories(${CMAKE_CUDA_TOOLKIT_INCLUDE_DIRECTORIES})
include_directories(${CMAKE_SOURCE_DIR}/cpp/include)

pybind11_add_module(_cuda_matrix_core
    cpp/bindings/bindings.cpp
    cpp/src/matrix.cu
    cpp/src/sparse_matrix.cu
    cpp/kernels/matmul.cu
    cpp/kernels/transpose.cu
    cpp/kernels/sparse.cu
)

set_target_properties(_cuda_matrix_core PROPERTIES
    CUDA_SEPARABLE_COMPILATION ON
    CUDA_RESOLVE_DEVICE_SYMBOLS ON
    LIBRARY_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/python/cuda_matrix"
)

target_compile_options(_cuda_matrix_core PRIVATE $<$<COMPILE_LANGUAGE:CUDA>:-O3>)
