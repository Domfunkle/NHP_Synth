#!/usr/bin/env python3
"""
Harmonic Sweep Example

Demonstrates sweeping harmonic phases and creating complex waveforms.
"""

import sys
import time
import math
sys.path.append('..')

from synth_control import SynthInterface, WaveformGenerator


def rolling_harmonic_demo(synth: SynthInterface):
    """Recreate the rolling harmonic phase demo from the README"""
    print("Starting rolling harmonic phase demo...")
    
    # Set base frequencies to 50Hz and full amplitude
    synth.set_frequency('a', 50)
    synth.set_frequency('b', 50)
    synth.set_amplitude('a', 100)
    synth.set_amplitude('b', 100)
    
    # Run for 10 seconds
    start_time = time.time()
    phase = -180
    
    while time.time() - start_time < 10:
        # Channel A: 5th harmonic with sweeping phase
        synth.add_harmonic('a', 5, 20, phase)
        
        # Channel B: 3rd harmonic with inverted phase
        synth.add_harmonic('b', 3, 10, -phase)
        
        time.sleep(0.03)
        phase += 1
        if phase > 180:
            phase = -180
            
    print("Rolling harmonic demo complete!")


def crazy_dual_channel_demo(synth: SynthInterface):
    """Go absolutely wild with both channels!"""
    print("🔥 GOING CRAZY WITH DUAL CHANNELS! 🔥")
    
    # Start with different base frequencies
    synth.set_frequency('a', 50)   # Fundamental
    synth.set_frequency('b', 150)  # 3rd harmonic
    synth.set_amplitude('a', 100)
    synth.set_amplitude('b', 100)
    
    print("Phase 1: Harmonic chaos (5 seconds)")
    start_time = time.time()
    while time.time() - start_time < 5:
        # Channel A: 3 harmonics (total limit: 8 across both channels)
        synth.add_harmonic('a', 3, 30, math.sin(time.time() * 2) * 180)
        synth.add_harmonic('a', 5, 20, math.cos(time.time() * 3) * 180)
        synth.add_harmonic('a', 7, 15, math.sin(time.time() * 1.5) * 180)
        
        # Channel B: 3 harmonics (3 + 3 = 6 total, within limit)
        synth.add_harmonic('b', 3, 25, -math.sin(time.time() * 2.5) * 180)
        synth.add_harmonic('b', 9, 10, math.cos(time.time() * 4) * 180)
        synth.add_harmonic('b', 11, 8, -math.sin(time.time() * 3.2) * 180)
        
        time.sleep(0.05)
    
    print("Phase 2: Frequency madness (5 seconds)")
    # Clear harmonics and do frequency sweeps
    synth.clear_harmonics('a')
    synth.clear_harmonics('b')
    
    start_time = time.time()
    while time.time() - start_time < 5:
        elapsed = time.time() - start_time
        # Channel A: Sine wave frequency modulation
        freq_a = 50 + 200 * math.sin(elapsed * 3)  # 50-250Hz
        # Channel B: Saw wave frequency modulation  
        freq_b = 100 + 300 * (elapsed % 1)  # 100-400Hz sawtooth
        
        synth.set_frequency('a', max(20, min(8000, freq_a)))
        synth.set_frequency('b', max(20, min(8000, freq_b)))
        
        # Add 1 harmonic each (2 total, within limit)
        synth.add_harmonic('a', 5, 15)
        synth.add_harmonic('b', 3, 20)
        
        time.sleep(0.02)
    
    print("Phase 3: Amplitude madness (5 seconds)")
    # Reset frequencies
    synth.set_frequency('a', 100)
    synth.set_frequency('b', 200)
    
    start_time = time.time()
    while time.time() - start_time < 5:
        elapsed = time.time() - start_time
        # Pulsing amplitudes
        amp_a = 50 + 50 * abs(math.sin(elapsed * 8))  # Fast pulse
        amp_b = 50 + 50 * abs(math.cos(elapsed * 5))  # Different rhythm
        
        synth.set_amplitude('a', amp_a)
        synth.set_amplitude('b', amp_b)
        
        # 1 harmonic each (2 total, within limit)
        phase = (elapsed * 360) % 360 - 180
        synth.add_harmonic('a', 3, 25, phase)
        synth.add_harmonic('b', 7, 15, -phase)
        
        time.sleep(0.03)
    
    print("Phase 4: Complete chaos (3 seconds)")
    start_time = time.time()
    while time.time() - start_time < 3:
        elapsed = time.time() - start_time
        
        # Random-ish frequencies within harmonic series
        harmonics = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500]
        freq_a = harmonics[int(elapsed * 10) % len(harmonics)]
        freq_b = harmonics[int(elapsed * 7) % len(harmonics)]
        
        synth.set_frequency('a', freq_a)
        synth.set_frequency('b', freq_b)
        
        # Crazy amplitude modulation
        amp_a = 30 + 70 * abs(math.sin(elapsed * 20))
        amp_b = 30 + 70 * abs(math.cos(elapsed * 15))
        
        synth.set_amplitude('a', amp_a)
        synth.set_amplitude('b', amp_b)
        
        # 2 harmonics each (4 total, within 8 limit)
        synth.add_harmonic('a', 3, 20, math.sin(elapsed * 30) * 180)
        synth.add_harmonic('a', 5, 10, math.cos(elapsed * 25) * 180)
        synth.add_harmonic('b', 7, 15, -math.sin(elapsed * 35) * 180)
        synth.add_harmonic('b', 9, 8, math.cos(elapsed * 40) * 180)
        
        time.sleep(0.01)  # Super fast updates!
    
    print("🎉 CRAZY DEMO COMPLETE! 🎉")


def waveform_demo(synth: SynthInterface):
    """Demonstrate different waveform types"""
    waveform_gen = WaveformGenerator(synth)
    
    print("Demonstrating waveform synthesis...")
    
    # Pure sine wave
    print("Pure sine wave (2 seconds)")
    waveform_gen.apply_waveform('a', 'sine', 50, 100)
    waveform_gen.apply_waveform('b', 'sine', 50, 100)
    time.sleep(2)
    
    # Square wave approximation
    print("Square wave approximation (3 seconds)")
    waveform_gen.apply_waveform('a', 'square', 50, 100)
    waveform_gen.apply_waveform('b', 'square', 50, 100)
    time.sleep(3)
    
    # Sawtooth wave approximation
    print("Sawtooth wave approximation (3 seconds)")
    waveform_gen.apply_waveform('a', 'sawtooth', 50, 100)
    waveform_gen.apply_waveform('b', 'sawtooth', 50, 100)
    time.sleep(3)
    
    # Clean up
    synth.clear_harmonics('a')
    synth.clear_harmonics('b')
    synth.set_amplitude('a', 0)
    synth.set_amplitude('b', 0)
    
    print("Waveform demo complete!")


def frequency_sweep_demo(synth: SynthInterface):
    """Demonstrate frequency sweeping"""
    waveform_gen = WaveformGenerator(synth)
    
    print("Frequency sweep: 50Hz to 500Hz (1st to 10th harmonic) over 5 seconds")
    synth.set_amplitude('a', 60)
    synth.set_amplitude('b', 60)
    waveform_gen.sweep_frequency('a', 50, 500, 5, 50)  # 50Hz harmonics range
    waveform_gen.sweep_frequency('b', 50, 500, 5, 50)  # 50Hz harmonics range
    synth.set_amplitude('a', 0)
    synth.set_amplitude('b', 0)

    print("Frequency sweep complete!")


def main():
    with SynthInterface('/dev/ttyUSB1') as synth:
        print("Connected to NHP_Synth for harmonic demonstrations")
        
        # Clear everything first
        synth.clear_harmonics('a')
        synth.clear_harmonics('b')
        synth.set_amplitude('a', 0)
        synth.set_amplitude('b', 0)
        
        try:
            # Run demonstrations
            rolling_harmonic_demo(synth)
            time.sleep(1)
            
            crazy_dual_channel_demo(synth)
            time.sleep(1)
            
            waveform_demo(synth)
            time.sleep(1)
            
            frequency_sweep_demo(synth)
            
        finally:
            # Clean shutdown
            print("Cleaning up...")
            synth.set_frequency('a', 50)
            synth.set_frequency('b', 50)
            synth.clear_harmonics('a')
            synth.clear_harmonics('b')
            synth.set_amplitude('a', 0)
            synth.set_amplitude('b', 0)
            print("All demos complete!")


if __name__ == '__main__':
    main()
