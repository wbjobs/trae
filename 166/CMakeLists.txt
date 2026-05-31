cmake_minimum_required(VERSION 3.21)
project(Thermostat LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# ---- Options ----
option(BUILD_FOR_ARM "Cross-compile for Linux ARM target" OFF)
option(ENABLE_MQTT "Enable real MQTT via paho-mqttpp (requires libpaho-mqttpp3)" OFF)

# ---- Slint ----
find_package(Slint QUIET)
if(NOT Slint_FOUND)
    include(FetchContent)
    FetchContent_Declare(
        Slint
        GIT_REPOSITORY https://github.com/slint-ui/slint.git
        GIT_TAG        v1.9.0
        SOURCE_SUBDIR  api/cpp
    )
    FetchContent_MakeAvailable(Slint)
endif()

# ---- SQLite3 ----
find_package(SQLite3 QUIET)
if(NOT SQLite3_FOUND)
    include(FetchContent)
    FetchContent_Declare(
        sqlite3
        URL https://www.sqlite.org/2024/sqlite-amalgamation-3450300.zip
    )
    FetchContent_GetProperties(sqlite3)
    if(NOT sqlite3_POPULATED)
        FetchContent_Populate(sqlite3)
        add_library(sqlite3 STATIC ${sqlite3_SOURCE_DIR}/sqlite3.c)
        target_include_directories(sqlite3 PUBLIC ${sqlite3_SOURCE_DIR})
        target_link_libraries(sqlite3 PUBLIC pthread dl)
    endif()
    set(SQLite3_LIBRARIES sqlite3)
    set(SQLite3_INCLUDE_DIRS ${sqlite3_SOURCE_DIR})
endif()

# ---- Sources ----
set(APP_SOURCES
    src/main.cpp
    src/thermostat.cpp
    src/db.cpp
    src/mqtt_client.cpp
)

set(APP_HEADERS
    include/thermostat.h
    include/db.h
    include/mqtt_client.h
)

# ---- Slint UI ----
slint_add_slint_executable(${PROJECT_NAME}
    SOURCES ${APP_SOURCES} ${APP_HEADERS}
)

slint_target_sources(${PROJECT_NAME}
    ui/app-window.slint
)

target_include_directories(${PROJECT_NAME} PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${SQLite3_INCLUDE_DIRS}
)

target_link_libraries(${PROJECT_NAME} PRIVATE
    Slint::Slint
    ${SQLite3_LIBRARIES}
)

if(ENABLE_MQTT)
    find_package(PkgConfig REQUIRED)
    pkg_check_modules(PAHOMQTT REQUIRED paho-mqttpp3)
    target_compile_definitions(${PROJECT_NAME} PRIVATE USE_REAL_MQTT=1)
    target_include_directories(${PROJECT_NAME} PRIVATE ${PAHOMQTT_INCLUDE_DIRS)
    target_link_libraries(${PROJECT_NAME} PRIVATE ${PAHOMQTT_LIBRARIES)
endif()

# ---- Platform specifics
if(BUILD_FOR_ARM)
    message(STATUS "Configuring for Linux ARM target")
    set_target_properties(${PROJECT_NAME} PROPERTIES
        BUILD_RPATH "/usr/local/lib"
    )
endif()

install(TARGETS ${PROJECT_NAME} RUNTIME DESTINATION bin)
