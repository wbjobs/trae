#!/bin/bash
# ============================================
#  Terrain Destruction System - Setup Script
# ============================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "============================================"
echo " Terrain Destruction System Setup"
echo "============================================"
echo ""

# Detect platform
PLATFORM="linux"
if [[ "$OSTYPE" == "darwin"* ]]; then
    PLATFORM="macos"
fi

echo "[INFO] Platform: $PLATFORM"

# Check if godot-cpp exists
if [ -d "godot-cpp" ]; then
    echo -e "${GREEN}[OK]${NC} godot-cpp directory found"
else
    echo -e "${YELLOW}[INFO]${NC} Cloning godot-cpp repository..."
    git clone -b 4.2 https://github.com/godotengine/godot-cpp.git godot-cpp
    if [ $? -ne 0 ]; then
        echo -e "${RED}[ERROR]${NC} Failed to clone godot-cpp"
        echo "Please ensure git is installed and try again."
        exit 1
    fi
fi

# Build godot-cpp
echo ""
echo "[INFO] Building godot-cpp bindings..."
cd godot-cpp
scons platform=$PLATFORM target=release
if [ $? -ne 0 ]; then
    echo -e "${RED}[ERROR]${NC} Failed to build godot-cpp"
    cd ..
    exit 1
fi
cd ..

echo ""
echo "[INFO] Building terrain destruction extension..."
scons platform=$PLATFORM target=release
if [ $? -ne 0 ]; then
    echo -e "${RED}[ERROR]${NC} Failed to build extension"
    exit 1
fi

echo ""
echo "============================================"
echo -e "${GREEN} Setup Complete!${NC}"
echo "============================================"
echo ""
echo " You can now open the project in Godot 4.2+"
echo ""
