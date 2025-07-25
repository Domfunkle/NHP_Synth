"""
Waveform Generator Utilities

Provides utilities for generating complex waveforms and harmonic series
for the NHP_Synth synthesizer.
"""

import numpy as np
import matplotlib.pyplot as plt
from typing import List, Tuple, Dict
from .synth_interface import SynthInterface


class WaveformGenerator:
    """Generate complex waveforms using harmonic synthesis"""
    
    def __init__(self, synth: SynthInterface):
        """
        Initialize with a synthesizer interface
        
        Args:
            synth: Connected SynthInterface instance
        """
        self.synth = synth
        
    def generate_sawtooth_harmonics(self, fundamental_freq: float, num_harmonics: int = 4) -> List[Tuple[int, float]]:
        """
        Generate harmonic series for sawtooth wave approximation (odd harmonics only for ESP32)
        
        Args:
            fundamental_freq: Base frequency in Hz
            num_harmonics: Number of harmonics to include
            
        Returns:
            List of (harmonic_order, amplitude_percent) tuples
        """
        harmonics = []
        for n in range(1, num_harmonics + 1):
            order = 2 * n + 1  # Odd harmonics only (3, 5, 7, ...)
            # Sawtooth uses alternating signs, but we approximate with amplitude scaling
            amplitude = 50 / order  # Reduced amplitude for sawtooth approximation
            harmonics.append((order, amplitude))
        return harmonics
        
    def generate_square_harmonics(self, fundamental_freq: float, num_harmonics: int = 4) -> List[Tuple[int, float]]:
        """
        Generate harmonic series for square wave approximation
        
        Args:
            fundamental_freq: Base frequency in Hz
            num_harmonics: Number of harmonics to include
            
        Returns:
            List of (harmonic_order, amplitude_percent) tuples
        """
        harmonics = []
        for n in range(1, num_harmonics + 1):
            order = 2 * n + 1  # Odd harmonics only (3, 5, 7, ...)
            amplitude = 100 / order  # 1/n amplitude relationship for square wave
            harmonics.append((order, amplitude))
        return harmonics
        
    def apply_waveform(self, channel: str, waveform_type: str, frequency: float, amplitude: float = 100):
        """
        Apply a predefined waveform to a channel
        
        Args:
            channel: 'a' or 'b'
            waveform_type: 'sine', 'sawtooth', 'square'
            frequency: Fundamental frequency in Hz
            amplitude: Overall amplitude 0-100%
        """
        # Clear existing harmonics
        self.synth.clear_harmonics(channel)
        
        # Set fundamental frequency and amplitude
        self.synth.set_frequency(channel, frequency)
        self.synth.set_amplitude(channel, amplitude)
        
        if waveform_type.lower() == 'sine':
            # Pure sine wave - no harmonics needed
            pass
        elif waveform_type.lower() == 'sawtooth':
            harmonics = self.generate_sawtooth_harmonics(frequency, 4)
            for order, percent in harmonics:
                self.synth.add_harmonic(channel, order, percent * amplitude / 100)
        elif waveform_type.lower() == 'square':
            harmonics = self.generate_square_harmonics(frequency, 4)
            for order, percent in harmonics:
                self.synth.add_harmonic(channel, order, percent * amplitude / 100)
        else:
            raise ValueError("Waveform type must be 'sine', 'sawtooth', or 'square'")
            
    def sweep_frequency(self, channel: str, start_freq: float, end_freq: float, 
                       duration: float, steps: int = 100):
        """
        Perform a frequency sweep
        
        Args:
            channel: 'a' or 'b'
            start_freq: Starting frequency in Hz
            end_freq: Ending frequency in Hz
            duration: Total sweep duration in seconds
            steps: Number of frequency steps
        """
        import time
        
        freq_step = (end_freq - start_freq) / steps
        time_step = duration / steps
        
        for i in range(steps):
            freq = start_freq + i * freq_step
            self.synth.set_frequency(channel, freq)
            time.sleep(time_step)
            
    def phase_sweep(self, channel: str, harmonic_order: int, duration: float = 10):
        """
        Continuously sweep the phase of a harmonic
        
        Args:
            channel: 'a' or 'b'
            harmonic_order: Which harmonic to sweep
            duration: Duration of sweep in seconds
        """
        import time
        
        start_time = time.time()
        while time.time() - start_time < duration:
            phase = ((time.time() - start_time) * 360 / 5) % 360 - 180  # 5 second cycle
            self.synth.add_harmonic(channel, harmonic_order, 20, phase)
            time.sleep(0.03)
            
    def plot_waveform_preview(self, harmonics: List[Tuple[int, float, float]], 
                            fundamental_freq: float, duration: float = 0.1):
        """
        Plot a preview of the waveform with given harmonics
        
        Args:
            harmonics: List of (order, amplitude_percent, phase_degrees) tuples
            fundamental_freq: Fundamental frequency in Hz
            duration: Time duration to plot in seconds
        """
        t = np.linspace(0, duration, int(duration * 48000))  # 48kHz sample rate
        waveform = np.zeros_like(t)
        
        # Add fundamental
        waveform += np.sin(2 * np.pi * fundamental_freq * t)
        
        # Add harmonics
        for order, amplitude, phase in harmonics:
            harmonic_freq = fundamental_freq * order
            phase_rad = np.radians(phase)
            waveform += (amplitude / 100) * np.sin(2 * np.pi * harmonic_freq * t + phase_rad)
            
        plt.figure(figsize=(12, 6))
        plt.plot(t * 1000, waveform)  # Convert to ms
        plt.xlabel('Time (ms)')
        plt.ylabel('Amplitude')
        plt.title(f'Waveform Preview: {fundamental_freq}Hz with Harmonics')
        plt.grid(True)
        plt.show()
