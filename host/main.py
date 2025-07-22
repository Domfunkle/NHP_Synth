#!/usr/bin/env python3
"""
NHP_Synth Main Control Program

I2C rotary encoder amplitude control interface for the ESP32 DDS synthesizer.
"""

import time
import board
import busio
import glob
from adafruit_seesaw.seesaw import Seesaw
from adafruit_seesaw.rotaryio import IncrementalEncoder
from adafruit_seesaw import digitalio, neopixel
from synth_control import SynthInterface


def find_all_synth_devices():
    """Find all synthesizer USB devices automatically using by-path"""
    synth_devices = []
    
    # First try by-path devices (more reliable)
    path_devices = glob.glob('/dev/serial/by-path/*')
    
    for device in path_devices:
        try:
            print(f"Trying device: {device}")
            with SynthInterface(device) as synth:
                # Quick test to see if it responds
                synth_devices.append(device)
                print(f"Found synthesizer on {device}")
        except Exception as e:
            print(f"Device {device} failed: {e}")
            continue
        
    if not synth_devices:
        raise Exception("No synthesizers found on any USB port")
    
    return synth_devices


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
                # Initialize button on pin 24 (following the sample code pattern)
                seesaw.pin_mode(24, seesaw.INPUT_PULLUP)
                button = digitalio.DigitalIO(seesaw, 24)
                print("Button initialized on pin 24")
                
            except Exception as e:
                print(f"Button initialization failed: {e}")
                print("Continuing without button functionality")
                # Create a dummy button object
                class DummyButton:
                    @property
                    def value(self):
                        return True  # Always "not pressed"
                button = DummyButton()
            
            try:
                # Initialize NeoPixel LED on pin 6
                pixel = neopixel.NeoPixel(seesaw, 6, 1)
                pixel.brightness = 0.5
                # Initial color will be set after variables are defined
                print("NeoPixel LED initialized on pin 6")
                
            except Exception as e:
                print(f"LED initialization failed: {e}")
                print("Continuing without LED functionality")
                # Create a dummy LED object
                class DummyPixel:
                    def fill(self, color):
                        pass
                    @property
                    def brightness(self):
                        return 0.5
                    @brightness.setter
                    def brightness(self, value):
                        pass
                pixel = DummyPixel()
            
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
        device_paths = find_all_synth_devices()
        print(f"Found {len(device_paths)} synthesizer(s)")
        
        # Open connections to all synthesizers
        synths = []
        for device_path in device_paths:
            try:
                synth = SynthInterface(device_path)
                synth.__enter__()  # Manually enter context manager
                synths.append(synth)
                print(f"Connected to synthesizer on {device_path}")
            except Exception as e:
                print(f"Failed to connect to {device_path}: {e}")
        
        if not synths:
            raise Exception("No synthesizers could be connected")
        
        print(f"Successfully connected to {len(synths)} synthesizer(s)")
        
        try:
            print("Connected to NHP_Synth")
                    
            # Initialize amplitude control variables
            last_position = encoder.position
            amplitude_a = [50.0] * len(synths)  # Start at 50% for each synth
            amplitude_b = [50.0] * len(synths)
            active_synth = 0  # Which synthesizer (0, 1, 2, ...)
            active_channel = 'a'  # Which channel ('a' or 'b')
            
            # Set initial amplitudes on all synthesizers
            for i, synth in enumerate(synths):
                synth.set_amplitude('a', amplitude_a[i])
                synth.set_amplitude('b', amplitude_b[i])
            
            # Set initial LED color based on starting synth and channel
            pixel.fill((255, 255, 0))  # Yellow for Synth 1 Channel A (starting position)
            
            print(f"\nRotary Encoder Control:")
            print(f"Controlling {len(synths)} synthesizer(s)")
            print(f"Current: Synth {active_synth + 1} Channel {active_channel.upper()}")
            print(f"Synth 1 - Channel A: {amplitude_a[0]}%, Channel B: {amplitude_b[0]}%")
            if len(synths) > 1:
                print(f"Synth 2 - Channel A: {amplitude_a[1]}%, Channel B: {amplitude_b[1]}%")
            print(f"Rotate encoder to adjust amplitude")
            print(f"Press button to cycle through channels")
            print(f"Press Ctrl+C to exit")
            
            button_pressed = False
            
            while True:
                try:
                    # Check for button press (cycle through channels)
                    if not button.value and not button_pressed:
                        button_pressed = True
                        
                        # Cycle through: Synth1-A → Synth1-B → Synth2-A → Synth2-B → ...
                        if active_channel == 'a':
                            active_channel = 'b'
                        else:
                            active_channel = 'a'
                            active_synth = (active_synth + 1) % len(synths)
                        
                        # Update LED color based on active synth and channel
                        if active_synth == 0:  # Synth 1
                            if active_channel == 'a':
                                pixel.fill((255, 255, 0))  # Yellow for Synth 1 Channel A
                            else:
                                pixel.fill((173, 216, 230))  # Light blue for Synth 1 Channel B
                        else:  # Synth 2
                            if active_channel == 'a':
                                pixel.fill((255, 0, 255))  # Magenta for Synth 2 Channel A
                            else:
                                pixel.fill((0, 0, 139))  # Dark blue for Synth 2 Channel B
                            
                        print(f"\nSwitched to Synth {active_synth + 1} Channel {active_channel.upper()}")
                        for i in range(len(synths)):
                            print(f"Synth {i + 1} - Channel A: {amplitude_a[i]}%, Channel B: {amplitude_b[i]}%")
                        time.sleep(0.2)  # Debounce
                        
                    elif button.value:
                        button_pressed = False
                    
                    # Check for keyboard input (non-blocking)
                    import select
                    import sys
                    
                    if select.select([sys.stdin], [], [], 0) == ([sys.stdin], [], []):
                        key = sys.stdin.readline().strip()
                        if key.lower() == 's':
                            # Cycle through channels with keyboard
                            if active_channel == 'a':
                                active_channel = 'b'
                            else:
                                active_channel = 'a'
                                active_synth = (active_synth + 1) % len(synths)
                            
                            # Update LED color based on active synth and channel
                            if active_synth == 0:  # Synth 1
                                if active_channel == 'a':
                                    pixel.fill((255, 255, 0))  # Yellow for Synth 1 Channel A
                                else:
                                    pixel.fill((173, 216, 230))  # Light blue for Synth 1 Channel B
                            else:  # Synth 2
                                if active_channel == 'a':
                                    pixel.fill((255, 0, 255))  # Magenta for Synth 2 Channel A
                                else:
                                    pixel.fill((0, 0, 139))  # Dark blue for Synth 2 Channel B
                                
                            print(f"\nSwitched to Synth {active_synth + 1} Channel {active_channel.upper()}")
                            for i in range(len(synths)):
                                print(f"Synth {i + 1} - Channel A: {amplitude_a[i]}%, Channel B: {amplitude_b[i]}%")
                    
                    # Check encoder position
                    position = encoder.position
                    if position != last_position:
                        # Calculate amplitude change (1 step = 2% change)
                        delta = (position - last_position) * 2
                        
                        if active_channel == 'a':
                            amplitude_a[active_synth] = max(0, min(100, amplitude_a[active_synth] + delta))
                            synths[active_synth].set_amplitude('a', amplitude_a[active_synth])
                            current_value = amplitude_a[active_synth]
                        else:
                            amplitude_b[active_synth] = max(0, min(100, amplitude_b[active_synth] + delta))
                            synths[active_synth].set_amplitude('b', amplitude_b[active_synth])
                            current_value = amplitude_b[active_synth]
                        
                        print(f"Synth {active_synth + 1} Channel {active_channel.upper()}: {current_value:.0f}%")
                        last_position = position
                    
                    time.sleep(0.01)  # Small delay to prevent excessive CPU usage
                    
                except KeyboardInterrupt:
                    print("\n\nExiting...")
                    break
            
            # Clean shutdown
            print("Shutting down...")
            for i, synth in enumerate(synths):
                synth.set_amplitude('a', 0)
                synth.set_amplitude('b', 0)
            print("All amplitudes set to 0")
            
        finally:
            # Close all synthesizer connections
            for synth in synths:
                try:
                    synth.__exit__(None, None, None)  # Manually exit context manager
                except:
                    pass
            
    except Exception as e:
        print(f"Error: {e}")
    
    print("Goodbye!")


if __name__ == '__main__':
    main()
