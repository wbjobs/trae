from setuptools import setup, find_packages

setup(
    name='task-scheduler-cli',
    version='1.0.0',
    description='Distributed Task Scheduler CLI',
    packages=find_packages(),
    py_modules=['scheduler_cli'],
    install_requires=[
        'click>=8.1.7',
        'requests>=2.31.0',
        'python-dotenv>=1.0.0',
        'prettytable>=3.9.0',
    ],
    entry_points={
        'console_scripts': [
            'scheduler-cli=scheduler_cli:cli',
        ],
    },
    python_requires='>=3.8',
)
