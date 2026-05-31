cmake_minimum_required(VERSION 3.14)
project(pixel_board C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if (EMSCRIPTEN)
    # WebAssembly build: assumes raylib source is under ./raylib or use find_package
    option(USE_LOCAL_RAYLIB "Use vendored raylib source" ON)
    if (USE_LOCAL_RAYLIB)
        set(RAYLIB_DIR "${CMAKE_CURRENT_SOURCE_DIR}/raylib" CACHE PATH "Path to raylib source")
        add_subdirectory(${RAYLIB_DIR} raylib_build EXCLUDE_FROM_ALL)
    else()
        find_package(raylib REQUIRED)
    endif()

    add_executable(pixel_board main.cpp)
    target_link_libraries(pixel_board PRIVATE raylib)
    target_compile_definitions(pixel_board PRIVATE PLATFORM_WASM)

    set_target_properties(pixel_board PROPERTIES
        SUFFIX ".html"
        LINK_FLAGS "-O2 -s USE_GLFW=3 -s ASYNCIFY -s TOTAL_MEMORY=67108864 -s FILESYSTEM=0 -s EXPORTED_RUNTIME_METHODS=['ccall','cwrap'] --shell-file ${CMAKE_CURRENT_SOURCE_DIR}/shell.html"
    )
else()
    # Native build
    find_package(raylib REQUIRED)
    add_executable(pixel_board main.cpp)
    target_link_libraries(pixel_board PRIVATE raylib)
    if (WIN32)
        target_link_libraries(pixel_board PRIVATE winmm)
    endif()
endif()
