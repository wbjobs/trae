cmake_minimum_required(VERSION 3.16)
project(BatchRenameTool VERSION 1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

find_package(Qt6 REQUIRED COMPONENTS Core Gui Widgets Sql)

set(PROJECT_SOURCES
    src/main.cpp
    src/MainWindow.cpp
    src/MainWindow.h
    src/FileRenamer.cpp
    src/FileRenamer.h
    src/RenameRule.cpp
    src/RenameRule.h
    src/HistoryManager.cpp
    src/HistoryManager.h
    src/PresetManager.cpp
    src/PresetManager.h
    src/ID3Reader.cpp
    src/ID3Reader.h
)

add_executable(BatchRenameTool
    ${PROJECT_SOURCES}
)

target_link_libraries(BatchRenameTool PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Widgets
    Qt6::Sql
)

target_include_directories(BatchRenameTool PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)

if(WIN32)
    set_target_properties(BatchRenameTool PROPERTIES
        WIN32_EXECUTABLE TRUE
    )
endif()
