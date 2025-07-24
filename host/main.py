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
    """Main program for multi-encoder function-specific control"""
    print("NHP_Synth Multi-Encoder Function Control")
    print("Connecting to I2C rotary encoders...")
    
    # Define encoder configurations
    encoder_configs = [
        {'addr': 0x36, 'name': 'Amplitude A', 'function': 'amplitude_a'},
        {'addr': 0x37, 'name': 'Amplitude B', 'function': 'amplitude_b'},
        {'addr': 0x38, 'name': 'Frequency', 'function': 'frequency'},
        {'addr': 0x39, 'name': 'Phase', 'function': 'phase'},
        {'addr': 0x3a, 'name': 'Harmonics', 'function': 'harmonics'}
    ]
    
    # Initialize I2C and rotary encoders
    try:
        i2c = busio.I2C(board.SCL, board.SDA)
        
        # Initialize all encoders
        encoders = {}
        buttons = {}
        pixels = {}
        
        for config in encoder_configs:
            addr = config['addr']
            name = config['name']
            
            seesaw = None
            for attempt in range(3):
                try:
                    print(f"Attempt {attempt + 1}: Connecting to {name} encoder at 0x{addr:02x}...")
                    time.sleep(0.5)  # Give device time to stabilize
                    
                    seesaw = Seesaw(i2c, addr=addr)
                    print(f"{name} encoder (0x{addr:02x}) initialized successfully")
                    break
                    
                except Exception as e:
                    print(f"Attempt {attempt + 1} failed for 0x{addr:02x}: {e}")
                    if attempt == 2:
                        print(f"Warning: Could not initialize {name} encoder at 0x{addr:02x}")
                        break
                    time.sleep(1)
            
            if seesaw is not None:
                try:
                    # Initialize encoder
                    encoder = IncrementalEncoder(seesaw)
                    encoders[config['function']] = encoder
                    print(f"{name} encoder created successfully")
                    
                    # Initialize button
                    try:
                        seesaw.pin_mode(24, seesaw.INPUT_PULLUP)
                        button = digitalio.DigitalIO(seesaw, 24)
                        buttons[config['function']] = button
                        print(f"{name} button initialized")
                    except Exception as e:
                        print(f"{name} button initialization failed: {e}")
                        buttons[config['function']] = None
                    
                    # Initialize LED
                    try:
                        pixel = neopixel.NeoPixel(seesaw, 6, 1)
                        pixel.brightness = 0.5
                        pixels[config['function']] = pixel
                        print(f"{name} LED initialized")
                    except Exception as e:
                        print(f"{name} LED initialization failed: {e}")
                        pixels[config['function']] = None
                        
                except Exception as e:
                    print(f"Failed to initialize {name} encoder components: {e}")
                    encoders[config['function']] = None
                    buttons[config['function']] = None
                    pixels[config['function']] = None
            else:
                encoders[config['function']] = None
                buttons[config['function']] = None
                pixels[config['function']] = None
        
        # Create dummy objects for missing components
        class DummyButton:
            @property
            def value(self):
                return True  # Always "not pressed"
        
        class DummyPixel:
            def fill(self, color):
                pass
            @property
            def brightness(self):
                return 0.5
            @brightness.setter
            def brightness(self, value):
                pass
        
        # Replace None buttons and pixels with dummy objects
        for func in ['amplitude_a', 'amplitude_b', 'frequency', 'phase', 'harmonics']:
            if buttons[func] is None:
                buttons[func] = DummyButton()
            if pixels[func] is None:
                pixels[func] = DummyPixel()
        
        print("Encoder initialization complete")
        
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
                    
            # Initialize control variables for all synths
            num_synths = len(synths)
            amplitude_a = [50.0] * num_synths  # Start at 50% for each synth
            amplitude_b = [50.0] * num_synths
            frequency_a = [50.0] * num_synths  # Start at 50Hz for each synth
            frequency_b = [50.0] * num_synths
            phase_a = [0.0] * num_synths  # Start at 0 degrees for each synth
            phase_b = [0.0] * num_synths
            harmonics_a = [0.0] * num_synths  # Start at 0% harmonics
            harmonics_b = [0.0] * num_synths
            
            # Control state for each encoder
            active_synth = {
                'amplitude_a': 0,  # Which synth this encoder controls
                'amplitude_b': 0,
                'frequency': 0,    # Frequency controls all synths simultaneously
                'phase': 0,
                'harmonics': 0
            }
            
            active_channel = {
                'phase': 'a',      # Phase cycles through all synths and channels
                'harmonics': 'a'   # Harmonics can switch between channels
            }
            
            # Store last encoder positions
            last_positions = {}
            for func in ['amplitude_a', 'amplitude_b', 'frequency', 'phase', 'harmonics']:
                if encoders[func]:
                    last_positions[func] = encoders[func].position
                else:
                    last_positions[func] = 0
            
            # Set initial values on all synthesizers
            for i, synth in enumerate(synths):
                synth.set_amplitude('a', amplitude_a[i])
                synth.set_amplitude('b', amplitude_b[i])
                synth.set_frequency('a', frequency_a[i])
                synth.set_frequency('b', frequency_b[i])
                synth.set_phase('a', phase_a[i])
                synth.set_phase('b', phase_b[i])
                # Note: harmonics will be implemented as frequency adjustment
            
            # Define default values for reset functionality
            default_values = {
                'amplitude_a': 50.0,    # 50% amplitude
                'amplitude_b': 50.0,    # 50% amplitude
                'frequency': 50.0,      # 50Hz frequency
                'phase': 0.0,           # 0 degrees phase
                'harmonics': 0.0        # 0% harmonics
            }
            
            # Set initial LED colors (distinct colors for each function)
            led_colors = {
                'amplitude_a': (255, 0, 0),      # Red for Amplitude A
                'amplitude_b': (255, 165, 0),    # Orange for Amplitude B  
                'frequency': (0, 255, 0),        # Green for Frequency
                'phase': (0, 0, 255),            # Blue for Phase
                'harmonics': (255, 0, 255)       # Magenta for Harmonics
            }
            
            for func, pixel in pixels.items():
                if pixel and func in led_colors:
                    pixel.fill(led_colors[func])
            
            print(f"\nMulti-Encoder Function Control:")
            print(f"Controlling {num_synths} synthesizer(s)")
            print(f"0x36 - Amplitude A: Synth {active_synth['amplitude_a'] + 1}")
            print(f"0x37 - Amplitude B: Synth {active_synth['amplitude_b'] + 1}")
            print(f"0x38 - Frequency: All synths simultaneously")
            print(f"0x39 - Phase: Synth {active_synth['phase'] + 1} Channel {active_channel['phase'].upper()}")
            print(f"0x3a - Harmonics: Synth {active_synth['harmonics'] + 1} Channel {active_channel['harmonics'].upper()}")
            
            for i in range(num_synths):
                print(f"Synth {i + 1} - Ch A: Amp={amplitude_a[i]:.0f}%, Freq={frequency_a[i]:.1f}Hz, Phase={phase_a[i]:.0f}°, Harm={harmonics_a[i]:.0f}%")
                print(f"Synth {i + 1} - Ch B: Amp={amplitude_b[i]:.0f}%, Freq={frequency_b[i]:.1f}Hz, Phase={phase_b[i]:.0f}°, Harm={harmonics_b[i]:.0f}%")
            
            print(f"\nEncoder Functions:")
            print(f"- Amplitude A: Press button to cycle through synths, Hold to reset to 50%")
            print(f"- Amplitude B: Press button to cycle through synths, Hold to reset to 50%") 
            print(f"- Frequency: Controls all synths together, Hold to reset to 50Hz")
            print(f"- Phase: Press button to cycle through all synth/channel combinations, Hold to reset to 0°")
            print(f"- Harmonics: Press button to cycle through all synth/channel combinations, Hold to reset to 0%")
            print(f"Press Ctrl+C to exit")
            
            # Button state tracking for all encoders (with hold timing)
            button_pressed = {func: False for func in ['amplitude_a', 'amplitude_b', 'frequency', 'phase', 'harmonics']}
            button_press_time = {func: 0 for func in ['amplitude_a', 'amplitude_b', 'frequency', 'phase', 'harmonics']}
            hold_threshold = 1.0  # Hold for 1 second to trigger reset
            
            while True:
                try:
                    # Handle button presses for all encoders
                    for func in ['amplitude_a', 'amplitude_b', 'frequency', 'phase', 'harmonics']:
                        if not encoders[func] or not buttons[func]:
                            continue
                            
                        button = buttons[func]
                        pixel = pixels[func]
                        
                        # Check for button press with hold detection
                        if not button.value and not button_pressed[func]:
                            # Button just pressed
                            button_pressed[func] = True
                            button_press_time[func] = time.time()
                            
                        elif not button.value and button_pressed[func]:
                            # Button is being held down - check for hold duration
                            hold_duration = time.time() - button_press_time[func]
                            if hold_duration >= hold_threshold:
                                # Long hold detected - reset to defaults
                                button_pressed[func] = False  # Prevent multiple resets
                                
                                if func == 'amplitude_a':
                                    # Reset amplitude A for active synth
                                    synth_idx = active_synth[func]
                                    amplitude_a[synth_idx] = default_values['amplitude_a']
                                    synths[synth_idx].set_amplitude('a', amplitude_a[synth_idx])
                                    print(f"\nAmplitude A Reset: Synth {synth_idx + 1} = {amplitude_a[synth_idx]:.0f}%")
                                    
                                elif func == 'amplitude_b':
                                    # Reset amplitude B for active synth
                                    synth_idx = active_synth[func]
                                    amplitude_b[synth_idx] = default_values['amplitude_b']
                                    synths[synth_idx].set_amplitude('b', amplitude_b[synth_idx])
                                    print(f"\nAmplitude B Reset: Synth {synth_idx + 1} = {amplitude_b[synth_idx]:.0f}%")
                                    
                                elif func == 'frequency':
                                    # Reset frequency for all synths
                                    for i in range(num_synths):
                                        frequency_a[i] = default_values['frequency']
                                        frequency_b[i] = default_values['frequency']
                                        synths[i].set_frequency('a', frequency_a[i])
                                        synths[i].set_frequency('b', frequency_b[i])
                                    print(f"\nFrequency Reset: All synths = {frequency_a[0]:.1f}Hz")
                                    
                                elif func == 'phase':
                                    # Reset phase for active synth and channel
                                    synth_idx = active_synth[func]
                                    channel = active_channel[func]
                                    if channel == 'a':
                                        phase_a[synth_idx] = default_values['phase']
                                        synths[synth_idx].set_phase('a', phase_a[synth_idx])
                                        print(f"\nPhase Reset: Synth {synth_idx + 1} Ch A = {phase_a[synth_idx]:.0f}°")
                                    else:
                                        phase_b[synth_idx] = default_values['phase']
                                        synths[synth_idx].set_phase('b', phase_b[synth_idx])
                                        print(f"\nPhase Reset: Synth {synth_idx + 1} Ch B = {phase_b[synth_idx]:.0f}°")
                                        
                                elif func == 'harmonics':
                                    # Reset harmonics for active synth and channel
                                    synth_idx = active_synth[func]
                                    channel = active_channel[func]
                                    if channel == 'a':
                                        harmonics_a[synth_idx] = default_values['harmonics']
                                        synths[synth_idx].clear_harmonics('a')
                                        print(f"\nHarmonics Reset: Synth {synth_idx + 1} Ch A = {harmonics_a[synth_idx]:.0f}%")
                                    else:
                                        harmonics_b[synth_idx] = default_values['harmonics']
                                        synths[synth_idx].clear_harmonics('b')
                                        print(f"\nHarmonics Reset: Synth {synth_idx + 1} Ch B = {harmonics_b[synth_idx]:.0f}%")
                                
                                # Flash LED white to indicate reset
                                if pixel:
                                    pixel.fill((255, 255, 255))
                                    time.sleep(0.2)
                                    pixel.fill(led_colors[func])
                            
                        elif button.value and button_pressed[func]:
                            # Button released
                            hold_duration = time.time() - button_press_time[func]
                            button_pressed[func] = False
                            
                            # Only process as short press if it was shorter than hold threshold
                            if hold_duration < hold_threshold:
                                # Short press: cycle through appropriate targets
                                if func == 'frequency':
                                    print(f"\nFrequency encoder controls all synths simultaneously")
                                elif func in ['amplitude_a', 'amplitude_b']:
                                    # Cycle through synths only
                                    active_synth[func] = (active_synth[func] + 1) % num_synths
                                    print(f"\n{func.replace('_', ' ').title()}: Switched to Synth {active_synth[func] + 1}")
                                elif func in ['phase', 'harmonics']:
                                    # Cycle through all synth/channel combinations: S1A -> S1B -> S2A -> S2B -> etc.
                                    if active_channel[func] == 'a':
                                        active_channel[func] = 'b'
                                    else:
                                        active_channel[func] = 'a'
                                        active_synth[func] = (active_synth[func] + 1) % num_synths
                                    
                                    print(f"\n{func.title()}: Switched to Synth {active_synth[func] + 1} Channel {active_channel[func].upper()}")
                                
                                # Show current status for all button presses except frequency
                                if func != 'frequency':
                                    for i in range(num_synths):
                                        print(f"Synth {i + 1} - Ch A: Amp={amplitude_a[i]:.0f}%, Freq={frequency_a[i]:.1f}Hz, Phase={phase_a[i]:.0f}°, Harm={harmonics_a[i]:.0f}%")
                                        print(f"Synth {i + 1} - Ch B: Amp={amplitude_b[i]:.0f}%, Freq={frequency_b[i]:.1f}Hz, Phase={phase_b[i]:.0f}°, Harm={harmonics_b[i]:.0f}%")
                                
                                time.sleep(0.1)  # Debounce
                    
                    # Check encoder positions for all encoders
                    for func in ['amplitude_a', 'amplitude_b', 'frequency', 'phase', 'harmonics']:
                        encoder = encoders[func]
                        if encoder is None:
                            continue
                            
                        position = encoder.position
                        if position != last_positions[func]:
                            # Calculate change
                            delta = position - last_positions[func]
                            
                            if func == 'amplitude_a':
                                # Amplitude A: 1 step = 2% change for active synth only
                                delta_val = delta * 2
                                synth_idx = active_synth[func]
                                amplitude_a[synth_idx] = max(0, min(100, amplitude_a[synth_idx] + delta_val))
                                synths[synth_idx].set_amplitude('a', amplitude_a[synth_idx])
                                print(f"Amplitude A: Synth {synth_idx + 1} = {amplitude_a[synth_idx]:.0f}%")
                                
                            elif func == 'amplitude_b':
                                # Amplitude B: 1 step = 2% change for active synth only
                                delta_val = delta * 2
                                synth_idx = active_synth[func]
                                amplitude_b[synth_idx] = max(0, min(100, amplitude_b[synth_idx] + delta_val))
                                synths[synth_idx].set_amplitude('b', amplitude_b[synth_idx])
                                print(f"Amplitude B: Synth {synth_idx + 1} = {amplitude_b[synth_idx]:.0f}%")
                                
                            elif func == 'frequency':
                                # Frequency: 1 step = 0.1Hz change for ALL synths and channels
                                delta_val = delta * 0.1
                                for i in range(num_synths):
                                    frequency_a[i] = max(20, min(8000, frequency_a[i] + delta_val))
                                    frequency_b[i] = max(20, min(8000, frequency_b[i] + delta_val))
                                    synths[i].set_frequency('a', frequency_a[i])
                                    synths[i].set_frequency('b', frequency_b[i])
                                print(f"Frequency: All synths = {frequency_a[0]:.1f}Hz")
                                
                            elif func == 'phase':
                                # Phase: 1 step = 5 degree change for active synth and channel
                                delta_val = delta * 5
                                synth_idx = active_synth[func]
                                channel = active_channel[func]
                                if channel == 'a':
                                    phase_a[synth_idx] = max(-180, min(180, phase_a[synth_idx] + delta_val))
                                    synths[synth_idx].set_phase('a', phase_a[synth_idx])
                                    print(f"Phase: Synth {synth_idx + 1} Ch A = {phase_a[synth_idx]:.0f}°")
                                else:
                                    phase_b[synth_idx] = max(-180, min(180, phase_b[synth_idx] + delta_val))
                                    synths[synth_idx].set_phase('b', phase_b[synth_idx])
                                    print(f"Phase: Synth {synth_idx + 1} Ch B = {phase_b[synth_idx]:.0f}°")
                                    
                            elif func == 'harmonics':
                                # Harmonics: 1 step = 5% change for active synth and channel
                                delta_val = delta * 5
                                synth_idx = active_synth[func]
                                channel = active_channel[func]
                                if channel == 'a':
                                    harmonics_a[synth_idx] = max(0, min(100, harmonics_a[synth_idx] + delta_val))
                                    # Use the add_harmonic method for 5th harmonic
                                    if harmonics_a[synth_idx] > 0:
                                        synths[synth_idx].add_harmonic('a', 5, harmonics_a[synth_idx])
                                    else:
                                        synths[synth_idx].clear_harmonics('a')
                                    print(f"Harmonics: Synth {synth_idx + 1} Ch A = {harmonics_a[synth_idx]:.0f}% (5th harmonic)")
                                else:
                                    harmonics_b[synth_idx] = max(0, min(100, harmonics_b[synth_idx] + delta_val))
                                    # Use the add_harmonic method for 5th harmonic
                                    if harmonics_b[synth_idx] > 0:
                                        synths[synth_idx].add_harmonic('b', 5, harmonics_b[synth_idx])
                                    else:
                                        synths[synth_idx].clear_harmonics('b')
                                    print(f"Harmonics: Synth {synth_idx + 1} Ch B = {harmonics_b[synth_idx]:.0f}% (5th harmonic)")
                            
                            last_positions[func] = position
                    
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
