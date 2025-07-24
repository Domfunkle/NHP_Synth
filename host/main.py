#!/usr/bin/env python3
"""
NHP_Synth Main Control Program

I2C rotary encoder amplitude control interface for the ESP32 DDS synthesizer.
"""

import time
import board
import busio
import glob
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from adafruit_seesaw.seesaw import Seesaw
from adafruit_seesaw.rotaryio import IncrementalEncoder
from adafruit_seesaw import digitalio, neopixel
from synth_control import SynthInterface

# ANSI color codes for console output
class Colors:
    HEADER = '\033[95m'     # Magenta
    BLUE = '\033[94m'       # Blue
    CYAN = '\033[96m'       # Cyan
    GREEN = '\033[92m'      # Green
    YELLOW = '\033[93m'     # Yellow
    RED = '\033[91m'        # Red
    ORANGE = '\033[38;5;208m'  # Orange
    BOLD = '\033[1m'        # Bold
    UNDERLINE = '\033[4m'   # Underline
    END = '\033[0m'         # Reset to default


def init_single_encoder(config, i2c, available_addresses):
    """Initialize a single encoder - designed for concurrent execution"""
    addr = config['addr']
    name = config['name']
    function = config['function']
    
    # Quick check against cached scan results
    if available_addresses and addr not in available_addresses:
        return function, None, None, None, f"No device at 0x{addr:02x} ({name}) - skipping"
    
    seesaw = None
    # Attempt connection with minimal retries
    for attempt in range(1 if available_addresses else 2):
        try:
            if attempt > 0:
                time.sleep(0.1)
            seesaw = Seesaw(i2c, addr=addr)
            break
        except:
            if attempt == 0 and not available_addresses:
                time.sleep(0.1)
            continue
    
    if seesaw is None:
        return function, None, None, None, f"{name} at 0x{addr:02x} failed"
    
    # Initialize components
    encoder = None
    button = None
    pixel = None
    components = []
    
    try:
        encoder = IncrementalEncoder(seesaw)
        encoder.position  # Cache initial position
        components.append("encoder")
    except:
        pass
    
    try:
        seesaw.pin_mode(24, seesaw.INPUT_PULLUP)
        button = digitalio.DigitalIO(seesaw, 24)
        components.append("button")
    except:
        pass
    
    try:
        pixel = neopixel.NeoPixel(seesaw, 6, 1)
        pixel.brightness = 0.5
        components.append("LED")
    except:
        pass
    
    status = f"{name}: {', '.join(components) if components else 'no components'}"
    return function, encoder, button, pixel, status


def find_all_synth_devices():
    """Find all synthesizer USB devices automatically using by-path"""
    synth_devices = []
    
    # First try by-path devices (more reliable)
    path_devices = glob.glob('/dev/serial/by-path/*')
    
    # Filter for likely USB serial devices to reduce scan time
    # Look for common ESP32/Arduino USB-to-serial chips
    usb_devices = []
    priority_keywords = ['usb', 'esp', 'arduino', 'ch34', 'cp210', 'ftdi']
    
    # First pass: prioritize devices with known keywords
    for device in path_devices:
        device_lower = device.lower()
        if any(keyword in device_lower for keyword in priority_keywords):
            usb_devices.append(device)
    
    # Second pass: add remaining USB devices if needed
    if not usb_devices:
        usb_devices = [d for d in path_devices if 'usb' in d.lower()]
    
    # Fall back to all devices if nothing found
    if not usb_devices:
        usb_devices = path_devices
    
    print(f"  → Scanning {len(usb_devices)} potential devices...")
    
    # Quick scan - try devices in order, but stop at first success for speed
    for i, device in enumerate(usb_devices):
        try:
            device_name = device.split('/')[-1]  # Get just the filename for cleaner output
            print(f"    [{i+1}/{len(usb_devices)}] Trying: {device_name}")
            # Quick test to see if it responds
            with SynthInterface(device) as synth:
                synth_devices.append(device)
                print(f"      {Colors.GREEN}✓ Found synthesizer{Colors.END}")
                # Continue scanning for multiple devices rather than stopping
        except Exception as e:
            # Don't print every failure to reduce console spam
            continue
    
    if not synth_devices:
        print(f"  {Colors.RED}✗ No synthesizers found. Tried devices:{Colors.END}")
        for device in usb_devices:
            print(f"      - {device.split('/')[-1]}")
        raise Exception("No synthesizers found on any USB port")
    
    return synth_devices


def initialize_system():
    """Initialize the complete NHP_Synth system and return all components"""
    init_start_time = time.time()
    print(f"{Colors.BOLD}{Colors.HEADER}NHP_Synth Multi-Encoder Function Control - Starting up...{Colors.END}")
    print(f"{Colors.CYAN}Initialization started at: {time.strftime('%H:%M:%S', time.localtime(init_start_time))}{Colors.END}")
    print(f"{Colors.BLUE}Step 1/3: Connecting to I2C rotary encoders...{Colors.END}")
    
    # Define encoder configurations
    encoder_configs = [
        {'addr': 0x36, 'name': 'Amplitude A', 'function': 'amplitude_a'},
        {'addr': 0x37, 'name': 'Amplitude B', 'function': 'amplitude_b'},
        {'addr': 0x38, 'name': 'Frequency', 'function': 'frequency'},
        {'addr': 0x39, 'name': 'Phase', 'function': 'phase'},
        {'addr': 0x3a, 'name': 'Harmonics', 'function': 'harmonics'}
    ]
    
    # Pre-create dummy objects for missing components (faster than creating them in loop)
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
    
    dummy_button = DummyButton()
    dummy_pixel = DummyPixel()
    
    # Initialize I2C and rotary encoders
    try:
        i2c = busio.I2C(board.SCL, board.SDA)
        
        # Do a single I2C scan upfront instead of per-device
        print(f"{Colors.CYAN}  → Scanning I2C bus for devices...{Colors.END}")
        available_addresses = set()
        try:
            i2c.try_lock()
            available_addresses = set(i2c.scan())
            i2c.unlock()
            if available_addresses:
                addr_list = [f"0x{addr:02x}" for addr in sorted(available_addresses)]
                print(f"{Colors.GREEN}  → Found I2C devices: {', '.join(addr_list)}{Colors.END}")
            else:
                print(f"{Colors.YELLOW}  → No I2C devices found{Colors.END}")
        except Exception as e:
            print(f"{Colors.YELLOW}  → I2C scan failed: {e}, proceeding with individual checks{Colors.END}")
        
        # Initialize all encoders
        encoders = {}
        buttons = {}
        pixels = {}
        
        # Try concurrent initialization if we have multiple encoders to speed things up
        present_configs = [config for config in encoder_configs 
                          if not available_addresses or config['addr'] in available_addresses]
        
        if len(present_configs) > 1:
            print(f"{Colors.CYAN}  → Initializing {len(present_configs)} encoders concurrently...{Colors.END}")
            # Use ThreadPoolExecutor for concurrent initialization
            with ThreadPoolExecutor(max_workers=3) as executor:
                # Submit all encoder initialization tasks
                future_to_config = {
                    executor.submit(init_single_encoder, config, i2c, available_addresses): config 
                    for config in present_configs
                }
                
                # Collect results as they complete
                for future in as_completed(future_to_config):
                    function, encoder, button, pixel, status = future.result()
                    encoders[function] = encoder
                    buttons[function] = button
                    pixels[function] = pixel
                    print(f"{Colors.GREEN}    ✓ {status}{Colors.END}")
            
            # Handle missing encoders
            missing_count = 0
            for config in encoder_configs:
                if config not in present_configs:
                    func = config['function']
                    encoders[func] = None
                    buttons[func] = None
                    pixels[func] = None
                    missing_count += 1
            
            if missing_count > 0:
                print(f"{Colors.YELLOW}    - {missing_count} encoder(s) not found{Colors.END}")
        else:
            # Fall back to sequential initialization for single/no encoders
            print(f"{Colors.CYAN}  → Initializing encoders sequentially...{Colors.END}")
            for config in encoder_configs:
                function, encoder, button, pixel, status = init_single_encoder(config, i2c, available_addresses)
                encoders[function] = encoder
                buttons[function] = button
                pixels[function] = pixel
                if encoder is not None or "skipping" in status:
                    print(f"{Colors.GREEN}    ✓ {status}{Colors.END}")
                else:
                    print(f"{Colors.RED}    ✗ {status}{Colors.END}")
        
        # Replace None buttons and pixels with dummy objects
        for func in ['amplitude_a', 'amplitude_b', 'frequency', 'phase', 'harmonics']:
            if buttons[func] is None:
                buttons[func] = dummy_button
            if pixels[func] is None:
                pixels[func] = dummy_pixel
        
        print(f"{Colors.CYAN}  → Encoder initialization complete{Colors.END}")
        
        step1_end_time = time.time()
        step1_duration = step1_end_time - init_start_time
        print(f"{Colors.GREEN}✓ Step 1 completed in {step1_duration:.2f} seconds{Colors.END}")
        
    except Exception as e:
        print(f"{Colors.RED}✗ Failed to connect to rotary encoder: {e}{Colors.END}")
        print(f"{Colors.YELLOW}  Make sure the I2C rotary encoder is connected and powered{Colors.END}")
        raise
    
    step2_start_time = time.time()
    print(f"\n{Colors.BLUE}Step 2/3: Connecting to synthesizer...{Colors.END}")
    
    try:
        device_paths = find_all_synth_devices()
        print(f"{Colors.GREEN}  → Found {len(device_paths)} synthesizer(s){Colors.END}")
        
        # Open connections to all synthesizers
        print(f"{Colors.CYAN}  → Establishing connections...{Colors.END}")
        synths = []
        for i, device_path in enumerate(device_paths):
            try:
                synth = SynthInterface(device_path)
                synth.__enter__()  # Manually enter context manager
                synths.append(synth)
                device_name = device_path.split('/')[-1]
                print(f"{Colors.GREEN}    ✓ Synth {i+1}: {device_name}{Colors.END}")
            except Exception as e:
                device_name = device_path.split('/')[-1]
                print(f"{Colors.RED}    ✗ Failed to connect to {device_name}: {e}{Colors.END}")
        
        if not synths:
            raise Exception("No synthesizers could be connected")
        
        step2_end_time = time.time()
        step2_duration = step2_end_time - step2_start_time
        print(f"{Colors.GREEN}✓ Step 2 completed in {step2_duration:.2f} seconds{Colors.END}")
        
        step3_start_time = time.time()
        print(f"\n{Colors.BLUE}Step 3/3: Initializing control system...{Colors.END}")
                
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
        print(f"{Colors.CYAN}  → Setting initial values on synthesizers...{Colors.END}")
        
        # Prepare batch commands for each synth to reduce serial communication overhead
        for i, synth in enumerate(synths):
            try:
                # Send all initial settings in one batch to reduce communication delays
                synth.set_amplitude('a', amplitude_a[i])
                synth.set_amplitude('b', amplitude_b[i])
                synth.set_frequency('a', frequency_a[i])
                synth.set_frequency('b', frequency_b[i])
                synth.set_phase('a', phase_a[i])
                synth.set_phase('b', phase_b[i])
                print(f"{Colors.GREEN}    ✓ Synth {i + 1} configured{Colors.END}")
            except Exception as e:
                print(f"{Colors.YELLOW}    ✗ Synth {i + 1} warning: {e}{Colors.END}")
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
                try:
                    pixel.fill(led_colors[func])
                except:
                    pass  # Don't let LED initialization slow us down
        
        print(f"{Colors.CYAN}  → LED colors configured{Colors.END}")
        
        step3_end_time = time.time()
        step3_duration = step3_end_time - step3_start_time
        total_init_time = step3_end_time - init_start_time
        print(f"{Colors.GREEN}✓ Step 3 completed in {step3_duration:.2f} seconds{Colors.END}")
        
        # Show initialization summary
        print(f"\n{Colors.BOLD}" + "="*60 + f"{Colors.END}")
        print(f"{Colors.BOLD}{Colors.HEADER}INITIALIZATION COMPLETE{Colors.END}")
        print(f"{Colors.BOLD}" + "="*60 + f"{Colors.END}")
        print(f"{Colors.CYAN}Started: {time.strftime('%H:%M:%S', time.localtime(init_start_time))}{Colors.END}")
        print(f"{Colors.CYAN}Finished: {time.strftime('%H:%M:%S', time.localtime(step3_end_time))}{Colors.END}")
        print(f"{Colors.YELLOW}Timing Breakdown:{Colors.END}")
        print(f"   {Colors.BLUE}Step 1 (I2C Encoders): {step1_duration:.2f}s{Colors.END}")
        print(f"   {Colors.BLUE}Step 2 (USB Synthesizers): {step2_duration:.2f}s{Colors.END}") 
        print(f"   {Colors.BLUE}Step 3 (Control System): {step3_duration:.2f}s{Colors.END}")
        print(f"{Colors.BOLD}{Colors.GREEN}Total initialization time: {total_init_time:.2f} seconds{Colors.END}")
        
        # Count successful initializations (optimized single pass)
        working_encoders = 0
        working_buttons = 0
        working_leds = 0
        
        for func in ['amplitude_a', 'amplitude_b', 'frequency', 'phase', 'harmonics']:
            if encoders[func] is not None:
                working_encoders += 1
            # Count real buttons (not dummy) - use identity check for speed
            if buttons[func] is not dummy_button:
                working_buttons += 1
            # Count real LEDs (not dummy) - use identity check for speed
            if pixels[func] is not dummy_pixel:
                working_leds += 1
        
        print(f"{Colors.BOLD}{Colors.CYAN}Hardware Status:{Colors.END}")
        print(f"   Synthesizers: {Colors.GREEN}{len(synths)}/{len(device_paths)} connected{Colors.END}")
        print(f"   Encoders: {Colors.GREEN}{working_encoders}/5 working{Colors.END}")
        print(f"   Buttons: {Colors.GREEN}{working_buttons}/5 working{Colors.END}") 
        print(f"   LEDs: {Colors.GREEN}{working_leds}/5 working{Colors.END}")
        
        print(f"\n{Colors.BOLD}{Colors.ORANGE}Control Configuration:{Colors.END}")
        print(f"   Controlling {Colors.YELLOW}{num_synths}{Colors.END} synthesizer(s)")
        print(f"   {Colors.RED}0x36 - Amplitude A (synth selectable){Colors.END}")
        print(f"   {Colors.ORANGE}0x37 - Amplitude B (synth selectable){Colors.END}")
        print(f"   {Colors.GREEN}0x38 - Frequency (all synths simultaneously){Colors.END}")
        print(f"   {Colors.BLUE}0x39 - Phase (synth/channel selectable){Colors.END}")
        print(f"   {Colors.HEADER}0x3a - Harmonics (synth/channel selectable){Colors.END}")

        print(f"\n{Colors.BOLD}{Colors.YELLOW}Current Settings:{Colors.END}")
        for i in range(num_synths):
            print(f"   {Colors.CYAN}Synth {i + 1} - Ch A: {Colors.RED}Amp={amplitude_a[i]:.0f}%{Colors.END}, {Colors.GREEN}Freq={frequency_a[i]:.1f}Hz{Colors.END}, {Colors.BLUE}Phase={phase_a[i]:.0f}°{Colors.END}, {Colors.HEADER}Harm={harmonics_a[i]:.0f}%{Colors.END}")
            print(f"   {Colors.CYAN}Synth {i + 1} - Ch B: {Colors.ORANGE}Amp={amplitude_b[i]:.0f}%{Colors.END}, {Colors.GREEN}Freq={frequency_b[i]:.1f}Hz{Colors.END}, {Colors.BLUE}Phase={phase_b[i]:.0f}°{Colors.END}, {Colors.HEADER}Harm={harmonics_b[i]:.0f}%{Colors.END}")
        
        print(f"\n{Colors.BOLD}{Colors.YELLOW}Usage Instructions:{Colors.END}")
        print(f"   • {Colors.RED}Amplitude A/B{Colors.END}: Press button to cycle synths, Hold to reset to 50%")
        print(f"   • {Colors.GREEN}Frequency{Colors.END}: Controls all synths together, Hold to reset to 50Hz")
        print(f"   • {Colors.BLUE}Phase{Colors.END}/{Colors.HEADER}Harmonics{Colors.END}: Press to cycle synth/channel, Hold to reset")
        print(f"   • Press {Colors.BOLD}Ctrl+C{Colors.END} to exit")
        print(f"{Colors.BOLD}" + "="*60 + f"{Colors.END}")
        
        # Return all initialized components
        return {
            'encoders': encoders,
            'buttons': buttons,
            'pixels': pixels,
            'synths': synths,
            'device_paths': device_paths,
            'dummy_button': dummy_button,
            'dummy_pixel': dummy_pixel,
            'led_colors': led_colors,
            'default_values': default_values,
            'amplitude_a': amplitude_a,
            'amplitude_b': amplitude_b,
            'frequency_a': frequency_a,
            'frequency_b': frequency_b,
            'phase_a': phase_a,
            'phase_b': phase_b,
            'harmonics_a': harmonics_a,
            'harmonics_b': harmonics_b,
            'active_synth': active_synth,
            'active_channel': active_channel,
            'last_positions': last_positions,
            'num_synths': num_synths
        }
        
    except Exception as e:
        # Clean up any opened synthesizer connections
        for synth in synths:
            try:
                synth.__exit__(None, None, None)
            except:
                pass
        raise


def handle_encoder_buttons(encoders, buttons, pixels, synths, button_pressed, button_press_time, 
                          hold_threshold, led_colors, default_values, amplitude_a, amplitude_b, 
                          frequency_a, frequency_b, phase_a, phase_b, harmonics_a, harmonics_b,
                          active_synth, active_channel, num_synths):
    """Handle button presses for all encoders with hold detection"""
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
                    print(f"\n{Colors.RED}Amplitude A Reset: Synth {synth_idx + 1} = {amplitude_a[synth_idx]:.0f}%{Colors.END}")
                    
                elif func == 'amplitude_b':
                    # Reset amplitude B for active synth
                    synth_idx = active_synth[func]
                    amplitude_b[synth_idx] = default_values['amplitude_b']
                    synths[synth_idx].set_amplitude('b', amplitude_b[synth_idx])
                    print(f"\n{Colors.ORANGE}Amplitude B Reset: Synth {synth_idx + 1} = {amplitude_b[synth_idx]:.0f}%{Colors.END}")
                    
                elif func == 'frequency':
                    # Reset frequency for all synths
                    for i in range(num_synths):
                        frequency_a[i] = default_values['frequency']
                        frequency_b[i] = default_values['frequency']
                        synths[i].set_frequency('a', frequency_a[i])
                        synths[i].set_frequency('b', frequency_b[i])
                    print(f"\n{Colors.GREEN}Frequency Reset: All synths = {frequency_a[0]:.1f}Hz{Colors.END}")
                    
                elif func == 'phase':
                    # Reset phase for active synth and channel
                    synth_idx = active_synth[func]
                    channel = active_channel[func]
                    if channel == 'a':
                        phase_a[synth_idx] = default_values['phase']
                        synths[synth_idx].set_phase('a', phase_a[synth_idx])
                        print(f"\n{Colors.BLUE}Phase Reset: Synth {synth_idx + 1} Ch A = {phase_a[synth_idx]:.0f}°{Colors.END}")
                    else:
                        phase_b[synth_idx] = default_values['phase']
                        synths[synth_idx].set_phase('b', phase_b[synth_idx])
                        print(f"\n{Colors.BLUE}Phase Reset: Synth {synth_idx + 1} Ch B = {phase_b[synth_idx]:.0f}°{Colors.END}")
                        
                elif func == 'harmonics':
                    # Reset harmonics for active synth and channel
                    synth_idx = active_synth[func]
                    channel = active_channel[func]
                    if channel == 'a':
                        harmonics_a[synth_idx] = default_values['harmonics']
                        synths[synth_idx].clear_harmonics('a')
                        print(f"\n{Colors.HEADER}Harmonics Reset: Synth {synth_idx + 1} Ch A = {harmonics_a[synth_idx]:.0f}%{Colors.END}")
                    else:
                        harmonics_b[synth_idx] = default_values['harmonics']
                        synths[synth_idx].clear_harmonics('b')
                        print(f"\n{Colors.HEADER}Harmonics Reset: Synth {synth_idx + 1} Ch B = {harmonics_b[synth_idx]:.0f}%{Colors.END}")
                
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


def handle_encoder_rotation(encoders, synths, last_positions, amplitude_a, amplitude_b, 
                           frequency_a, frequency_b, phase_a, phase_b, harmonics_a, harmonics_b,
                           active_synth, active_channel, num_synths):
    """Handle encoder rotation for all encoders"""
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
                print(f"{Colors.RED}Amplitude A: Synth {synth_idx + 1} = {amplitude_a[synth_idx]:.0f}%{Colors.END}")
                
            elif func == 'amplitude_b':
                # Amplitude B: 1 step = 2% change for active synth only
                delta_val = delta * 2
                synth_idx = active_synth[func]
                amplitude_b[synth_idx] = max(0, min(100, amplitude_b[synth_idx] + delta_val))
                synths[synth_idx].set_amplitude('b', amplitude_b[synth_idx])
                print(f"{Colors.ORANGE}Amplitude B: Synth {synth_idx + 1} = {amplitude_b[synth_idx]:.0f}%{Colors.END}")
                
            elif func == 'frequency':
                # Frequency: 1 step = 0.1Hz change for ALL synths and channels
                delta_val = delta * 0.1
                for i in range(num_synths):
                    frequency_a[i] = max(20, min(8000, frequency_a[i] + delta_val))
                    frequency_b[i] = max(20, min(8000, frequency_b[i] + delta_val))
                    synths[i].set_frequency('a', frequency_a[i])
                    synths[i].set_frequency('b', frequency_b[i])
                print(f"{Colors.GREEN}Frequency: All synths = {frequency_a[0]:.1f}Hz{Colors.END}")
                
            elif func == 'phase':
                # Phase: 1 step = 5 degree change for active synth and channel
                delta_val = delta * 5
                synth_idx = active_synth[func]
                channel = active_channel[func]
                if channel == 'a':
                    phase_a[synth_idx] = max(-180, min(180, phase_a[synth_idx] + delta_val))
                    synths[synth_idx].set_phase('a', phase_a[synth_idx])
                    print(f"{Colors.BLUE}Phase: Synth {synth_idx + 1} Ch A = {phase_a[synth_idx]:.0f}°{Colors.END}")
                else:
                    phase_b[synth_idx] = max(-180, min(180, phase_b[synth_idx] + delta_val))
                    synths[synth_idx].set_phase('b', phase_b[synth_idx])
                    print(f"{Colors.BLUE}Phase: Synth {synth_idx + 1} Ch B = {phase_b[synth_idx]:.0f}°{Colors.END}")
                    
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
                    print(f"{Colors.HEADER}Harmonics: Synth {synth_idx + 1} Ch A = {harmonics_a[synth_idx]:.0f}% (5th harmonic){Colors.END}")
                else:
                    harmonics_b[synth_idx] = max(0, min(100, harmonics_b[synth_idx] + delta_val))
                    # Use the add_harmonic method for 5th harmonic
                    if harmonics_b[synth_idx] > 0:
                        synths[synth_idx].add_harmonic('b', 5, harmonics_b[synth_idx])
                    else:
                        synths[synth_idx].clear_harmonics('b')
                    print(f"{Colors.HEADER}Harmonics: Synth {synth_idx + 1} Ch B = {harmonics_b[synth_idx]:.0f}% (5th harmonic){Colors.END}")
            
            last_positions[func] = position


def main():
    """Main program for multi-encoder function-specific control"""
    try:
        # Initialize the complete system
        system = initialize_system()
        
        # Extract components from the initialization result
        encoders = system['encoders']
        buttons = system['buttons']
        pixels = system['pixels']
        synths = system['synths']
        device_paths = system['device_paths']
        dummy_button = system['dummy_button']
        dummy_pixel = system['dummy_pixel']
        led_colors = system['led_colors']
        default_values = system['default_values']
        amplitude_a = system['amplitude_a']
        amplitude_b = system['amplitude_b']
        frequency_a = system['frequency_a']
        frequency_b = system['frequency_b']
        phase_a = system['phase_a']
        phase_b = system['phase_b']
        harmonics_a = system['harmonics_a']
        harmonics_b = system['harmonics_b']
        active_synth = system['active_synth']
        active_channel = system['active_channel']
        last_positions = system['last_positions']
        num_synths = system['num_synths']
        
        try:
            # Button state tracking for all encoders (with hold timing)
            button_pressed = {func: False for func in ['amplitude_a', 'amplitude_b', 'frequency', 'phase', 'harmonics']}
            button_press_time = {func: 0 for func in ['amplitude_a', 'amplitude_b', 'frequency', 'phase', 'harmonics']}
            hold_threshold = 1.0  # Hold for 1 second to trigger reset
            
            while True:
                try:
                    # Handle button presses for all encoders
                    handle_encoder_buttons(encoders, buttons, pixels, synths, button_pressed, 
                                         button_press_time, hold_threshold, led_colors, 
                                         default_values, amplitude_a, amplitude_b, frequency_a, 
                                         frequency_b, phase_a, phase_b, harmonics_a, harmonics_b,
                                         active_synth, active_channel, num_synths)
                    
                    # Handle encoder rotation for all encoders
                    handle_encoder_rotation(encoders, synths, last_positions, amplitude_a, 
                                          amplitude_b, frequency_a, frequency_b, phase_a, phase_b, 
                                          harmonics_a, harmonics_b, active_synth, active_channel, 
                                          num_synths)
                    
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
        print(f"{Colors.RED}Error: {e}{Colors.END}")
    
    print("Goodbye!")


if __name__ == '__main__':
    main()
