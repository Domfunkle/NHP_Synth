from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="nhp-synth-control",
    version="0.0.1",
    author="Daniel Nathanson",
    author_email="dnathanson@example.com",
    description="Python control interface for NHP_Synth ESP32 DDS Synthesizer",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/Domfunkle/NHP_Synth",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
    python_requires=">=3.8",
    install_requires=[
        "pyserial>=3.5",
        "numpy>=1.20.0",
        "matplotlib>=3.5.0",
    ],
    extras_require={
        "dev": [
            "pytest>=6.0",
            "black>=21.0",
            "pylint>=2.0",
        ],
    },
)
