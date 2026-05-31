cmake_minimum_required(VERSION 3.18)
project(SparseSVD LANGUAGES CXX CUDA)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CUDA_STANDARD 17)
set(CMAKE_CUDA_STANDARD_REQUIRED ON)

find_package(CUDAToolkit REQUIRED)

include(FetchContent)
FetchContent_Declare(
    pybind11
    GIT_REPOSITORY https://github.com/pybind/pybind11.git
    GIT_TAG        v2.12.0
)
FetchContent_MakeAvailable(pybind11)

set(CMAKE_CUDA_ARCHITECTURES "70;75;80;86;89;90")

add_library(svd_core STATIC
    src/svd_solver.cu
)

target_include_directories(svd_core PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CUDAToolkit_INCLUDE_DIRS}
)

target_link_libraries(svd_core PUBLIC
    CUDA::cudart
)

set_target_properties(svd_core PROPERTIES
    POSITION_INDEPENDENT_CODE ON
)

pybind11_add_module(sparse_svd src/bindings.cpp)
target_link_libraries(sparse_svd PRIVATE svd_core)
