cmake_minimum_required(VERSION 3.20)
project(DynamicInferenceService LANGUAGES CXX)

option(USE_CUDA "Enable CUDA execution provider" OFF)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

find_package(Protobuf CONFIG REQUIRED)
find_package(gRPC CONFIG REQUIRED)
find_package(ONNXRuntime CONFIG REQUIRED)

set(PROTO_DIR ${CMAKE_SOURCE_DIR}/proto)
set(GENERATED_DIR ${CMAKE_BINARY_DIR}/generated)
file(MAKE_DIRECTORY ${GENERATED_DIR})

set(PROTO_FILE ${PROTO_DIR}/inference.proto)

add_custom_command(
    OUTPUT
        ${GENERATED_DIR}/inference.pb.h
        ${GENERATED_DIR}/inference.pb.cc
        ${GENERATED_DIR}/inference.grpc.pb.h
        ${GENERATED_DIR}/inference.grpc.pb.cc
    COMMAND protobuf::protoc
    ARGS
        --grpc_out=${GENERATED_DIR}
        --cpp_out=${GENERATED_DIR}
        -I${PROTO_DIR}
        --plugin=protoc-gen-grpc=$<TARGET_FILE:gRPC::grpc_cpp_plugin>
        ${PROTO_FILE}
    DEPENDS ${PROTO_FILE}
    COMMENT "Generating gRPC and protobuf code from ${PROTO_FILE}"
)

set(GENERATED_SRCS
    ${GENERATED_DIR}/inference.pb.cc
    ${GENERATED_DIR}/inference.grpc.pb.cc
)

include_directories(
    ${CMAKE_SOURCE_DIR}/include
    ${GENERATED_DIR}
)

add_executable(inference_server
    src/server.cpp
    src/inference_service.cpp
    src/inference_engine.cpp
    src/buffer_cache.cpp
    src/shard_manager.cpp
    src/access_predictor.cpp
    ${GENERATED_SRCS}
)
target_link_libraries(inference_server
    gRPC::grpc++
    protobuf::libprotobuf
    ONNXRuntime::onnxruntime
)

if(USE_CUDA)
    target_compile_definitions(inference_server PRIVATE USE_CUDA)
endif()

add_executable(inference_client
    src/client.cpp
    ${GENERATED_SRCS}
)
target_link_libraries(inference_client
    gRPC::grpc++
    protobuf::libprotobuf
    ONNXRuntime::onnxruntime
)
