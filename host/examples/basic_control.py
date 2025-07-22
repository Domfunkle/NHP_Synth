#!/usr/bin/env python3
"""
Basic NHP_Synth Control Example

Demonstrates basic control of the ESP32 synthesizer via Python.
"""

import sys
import time
sys.path.append('..')

from synth_control import SynthInterface


def main():
    # Connect to synthesizer
    with SynthInterface('/dev/ttyUSB1') as synth:
        print("Connected to NHP_Synth")
        
        # Set basic sine waves
        print("Setting Channel A: 250Hz, 80% amplitude")
        synth.set_frequency('a', 250)  # 5th harmonic of 50Hz
        synth.set_amplitude('a', 80)
        
        print("Setting Channel B: 350Hz, 60% amplitude, 90° phase shift")
        synth.set_frequency('b', 350)  # 7th harmonic of 50Hz
        synth.set_amplitude('b', 60)
        synth.set_phase('b', 90)
        
        time.sleep(2)
        
        # Add some harmonics to Channel A
        print("Adding harmonics to Channel A...")
        synth.add_harmonic('a', 3, 20)   # 3rd harmonic at 20%
        synth.add_harmonic('a', 5, 10)   # 5th harmonic at 10%
        synth.add_harmonic('a', 7, 5)    # 7th harmonic at 5%
        
        time.sleep(3)
        
        # Clear harmonics
        print("Clearing harmonics...")
        synth.clear_harmonics('a')
        synth.clear_harmonics('b')
        
        # Reduce amplitude gradually
        print("Fading out...")
        for amp in range(80, 0, -5):
            synth.set_amplitude('a', amp)
            synth.set_amplitude('b', amp * 0.75)  # B channel slightly lower
            time.sleep(0.1)
            
        # Reset to fundamental frequency
        print("Resetting to 50Hz fundamental...")
        synth.set_frequency('a', 50)  # Fundamental frequency
        synth.set_frequency('b', 50)  # Fundamental frequency
        synth.set_phase('b', 0)       # Reset phase
        synth.set_amplitude('a', 50)  # Moderate amplitude
        synth.set_amplitude('b', 50)  # Moderate amplitude
        
        time.sleep(1)
        
        # Final fade out
        print("Final fade out...")
        for amp in range(50, 0, -5):
            synth.set_amplitude('a', amp)
            synth.set_amplitude('b', amp)
            time.sleep(0.1)
            
        print("Demo complete!")


if __name__ == '__main__':
    main()
