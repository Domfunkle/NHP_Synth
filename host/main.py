#!/usr/bin/env python3
"""
NHP_Synth Main Control Program

I2C rotary encoder amplitude control interface for the ESP32 DDS synthesizer.
"""

import time
import board
import busio
from adafruit_seesaw.seesaw import Seesaw
from adafruit_seesaw.rotaryio import IncrementalEncoder
from adafruit_seesaw.digitalio import DigitalIO
from synth_control import SynthInterface


def main():
    """Main program for rotary encoder amplitude control"""
    print("NHP_Synth Rotary Encoder Control")
    print("Connecting to I2C rotary encoder...")
    
    # Initialize I2C and rotary encoder
    try:
        i2c = busio.I2C(board.SCL, board.SDA)
        
        # Add retry logic with delays
        seesaw = None
        for attempt in range(3):
            try:
                print(f"Attempt {attempt + 1}: Connecting to rotary encoder at 0x36...")
                time.sleep(0.5)  # Give device time to stabilize
                
                seesaw = Seesaw(i2c, addr=0x36)
                
                # Simple test - try to read the status instead
                print("Seesaw initialized successfully")
                break
                
            except Exception as e:
                print(f"Attempt {attempt + 1} failed: {e}")
                if attempt == 2:
                    raise
                time.sleep(1)
        
        if seesaw is None:
            raise Exception("Failed to initialize Seesaw after multiple attempts")
        
        # Initialize encoder and button with error checking
        try:
            print("Testing device capabilities...")
            
            # Try to identify what kind of seesaw device this is
            try:
                # Test if this device supports encoder functionality
                print("Attempting to create encoder...")
                encoder = IncrementalEncoder(seesaw)
                print("Encoder created successfully")
            except Exception as e:
                print(f"Encoder creation failed: {e}")
                print("This might not be a rotary encoder board")
                raise
            
            try:
                # Try different button pins - common pins are 24, 6, 5, 9
                button_pins = [24, 6, 5, 9, 10, 11, 12, 13]
                button = None
                
                for pin in button_pins:
                    try:
                        print(f"Trying button on pin {pin}...")
                        button = DigitalIO(seesaw, pin)
                        button.direction = False  # Input
                        button.pull = True  # Pull-up
                        print(f"Button initialized successfully on pin {pin}")
                        break
                    except Exception as e:
                        print(f"Pin {pin} failed: {e}")
                        continue
                
                if button is None:
                    print("Warning: Could not initialize button on any pin")
                    print("Continuing without button functionality")
                    # Create a dummy button object
                    class DummyButton:
                        @property
                        def value(self):
                            return True  # Always "not pressed"
                    button = DummyButton()
                
            except Exception as e:
                print(f"Button initialization failed: {e}")
                raise
            
            # Test encoder reading
            initial_position = encoder.position
            print(f"Initial encoder position: {initial_position}")
            
        except Exception as e:
            print(f"Failed to initialize encoder/button: {e}")
            raise
        
        print("Rotary encoder connected successfully")
        
    except Exception as e:
        print(f"Failed to connect to rotary encoder: {e}")
        print("Make sure the I2C rotary encoder is connected and powered")
        print("Device detected at 0x36, but initialization failed")
        return
    
    print("Connecting to synthesizer...")
    
    try:
        with SynthInterface('/dev/ttyUSB0') as synth:
            print("Connected to NHP_Synth")
                    
            # Initialize amplitude control variables
            last_position = encoder.position
            amplitude_a = 50.0  # Start at 50%
            amplitude_b = 50.0
            active_channel = 'a'  # Start with channel A
            
            # Set initial amplitudes
            synth.set_amplitude('a', amplitude_a)
            synth.set_amplitude('b', amplitude_b)
            
            print(f"\nRotary Encoder Control:")
            print(f"Current channel: {active_channel.upper()}")
            print(f"Channel A: {amplitude_a}%")
            print(f"Channel B: {amplitude_b}%")
            print(f"Rotate encoder to adjust amplitude")
            print(f"Press button to switch channels")
            print(f"Press Ctrl+C to exit")
            
            button_pressed = False
            
            while True:
                try:
                    # Check for button press (switch channels)
                    if not button.value and not button_pressed:
                        button_pressed = True
                        active_channel = 'b' if active_channel == 'a' else 'a'
                        print(f"\nSwitched to channel {active_channel.upper()}")
                        print(f"Channel A: {amplitude_a}%")
                        print(f"Channel B: {amplitude_b}%")
                        time.sleep(0.2)  # Debounce
                        
                    elif button.value:
                        button_pressed = False
                    
                    # Check for keyboard input (non-blocking)
                    import select
                    import sys
                    
                    if select.select([sys.stdin], [], [], 0) == ([sys.stdin], [], []):
                        key = sys.stdin.readline().strip()
                        if key.lower() == 's':
                            active_channel = 'b' if active_channel == 'a' else 'a'
                            print(f"\nSwitched to channel {active_channel.upper()}")
                            print(f"Channel A: {amplitude_a}%")
                            print(f"Channel B: {amplitude_b}%")
                    
                    # Check encoder position
                    position = encoder.position
                    if position != last_position:
                        # Calculate amplitude change (1 step = 2% change)
                        delta = (position - last_position) * 2
                        
                        if active_channel == 'a':
                            amplitude_a = max(0, min(100, amplitude_a + delta))
                            synth.set_amplitude('a', amplitude_a)
                        else:
                            amplitude_b = max(0, min(100, amplitude_b + delta))
                            synth.set_amplitude('b', amplitude_b)
                        
                        print(f"Channel {active_channel.upper()}: {amplitude_a if active_channel == 'a' else amplitude_b:.0f}%")
                        last_position = position
                    
                    time.sleep(0.01)  # Small delay to prevent excessive CPU usage
                    
                except KeyboardInterrupt:
                    print("\n\nExiting...")
                    break
            
            # Clean shutdown
            print("Shutting down...")
            synth.set_amplitude('a', 0)
            synth.set_amplitude('b', 0)
            print("Amplitudes set to 0")
            
    except Exception as e:
        print(f"Error: {e}")
    
    print("Goodbye!")


if __name__ == '__main__':
    main()
