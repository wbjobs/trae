import os
import sys
import subprocess
import shutil

def build():
    build_dir = "build"
    if os.path.exists(build_dir):
        shutil.rmtree(build_dir)
    os.makedirs(build_dir)

    config = "Release"
    cmake_args = [
        "cmake",
        "..",
        "-DCMAKE_BUILD_TYPE=" + config,
    ]

    if sys.platform == "win32":
        cmake_args += ["-G", "Visual Studio 17 2022"]

    subprocess.check_call(cmake_args, cwd=build_dir)

    build_args = [
        "cmake",
        "--build",
        ".",
        "--config",
        config,
    ]

    subprocess.check_call(build_args, cwd=build_dir)
    print("Build completed successfully!")

if __name__ == "__main__":
    build()
