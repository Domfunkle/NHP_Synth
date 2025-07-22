"""
NHP Synth Control Library

This package provides Python control interface for the ESP32 NHP_Synth
dual-channel DDS synthesizer.
"""

__version__ = "1.0.0"
__author__ = "Daniel Nathanson"

from .uart_interface import SynthInterface
from .waveform_generator import WaveformGenerator

__all__ = ['SynthInterface', 'WaveformGenerator']
