#!/usr/bin/env python
import os
import sys

# Godot 4 GDExtension build configuration
# This file is used when building as part of the Godot module system

module_version = "1.0.0"
module_name = "terrain_destruction"

# Configure
can_build = True

# Source files
sources = [
    "src/register_types.cpp",
    "src/terrain/terrain_data.cpp",
    "src/terrain/terrain_mesh.cpp",
    "src/explosive/explosive.cpp",
    "src/explosive/volume_tracker.cpp",
]

# Header files
headers = [
    "src/register_types.h",
    "src/terrain/terrain_data.h",
    "src/terrain/terrain_mesh.h",
    "src/explosive/explosive.h",
    "src/explosive/volume_tracker.h",
]

# Include directories
include_dirs = [
    "src",
]

# Libraries
libraries = []

# Compiler flags
cxxflags = []

# Linker flags
linkflags = []
