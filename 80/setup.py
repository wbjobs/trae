from setuptools import setup, find_packages

setup(
    name="mapreduce-cli",
    version="1.0.0",
    packages=find_packages(),
    include_package_data=True,
    install_requires=[
        "PyYAML>=6.0",
        "rpyc>=5.3.0",
        "click>=8.0.0",
    ],
    entry_points={
        "console_scripts": [
            "mr=mr.cli:cli",
        ],
    },
    author="MapReduce CLI",
    description="A command-line tool for submitting MapReduce jobs to a cluster",
)
