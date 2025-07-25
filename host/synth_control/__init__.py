"""
NHP Synth Control Library

This package provides Python control interface for the ESP32 NHP_Synth
dual-channel DDS synthesizer.
"""

__version__ = "1.0.0"
__author__ = "Daniel Nathanson"

from .synth_interface import SynthInterface
from .waveform_generator import WaveformGenerator
from .synth_state import SynthStateManager
from .synth_discovery import SynthDiscovery
from .system_initializer import SystemInitializer
from .encoder_manager import EncoderManager
from .utils import Colors

__all__ = ['SynthInterface', 'WaveformGenerator', 'SynthStateManager', 'SynthDiscovery', 'SystemInitializer', 'EncoderManager', 'Colors', ]
