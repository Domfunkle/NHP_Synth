#!/usr/bin/env python3
"""
NHP_Synth Main Control Program

I2C rotary encoder amplitude control interface for the ESP32 DDS synthesizer.
"""

import time
import json
import os
import board
import busio
import glob
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from adafruit_seesaw.seesaw import Seesaw
from adafruit_seesaw.rotaryio import IncrementalEncoder
from adafruit_seesaw import digitalio, neopixel
from synth_control import SynthInterface


# Path for persistent synth state
STATE_FILE = os.path.join(os.path.dirname(__file__), 'synth_state.json')



# Load per-synth DEFAULTS from defaults.json
DEFAULTS_FILE = os.path.join(os.path.dirname(__file__), 'defaults.json')
try:
    with open(DEFAULTS_FILE, 'r') as f:
        defaults_data = json.load(f)
    # If file contains a list, use as per-synth defaults
    if isinstance(defaults_data, dict) and 'synths' in defaults_data and isinstance(defaults_data['synths'], list):
        DEFAULTS_LIST = defaults_data['synths']
    elif isinstance(defaults_data, list):
        DEFAULTS_LIST = defaults_data
    else:
        DEFAULTS_LIST = [defaults_data]
except Exception as e:
    print(f"{Colors.RED}Warning: Could not load defaults.json: {e}{Colors.END}")
    DEFAULTS_LIST = [{
        'amplitude_a': 100.0,
        'amplitude_b': 50.0,
        'frequency_a': 50.0,
        'frequency_b': 50.0,
        'phase_a': 0.0,
        'phase_b': 0.0,
        'harmonics_a': 0.0,
        'harmonics_b': 0.0
    }]

def get_default_for_synth(idx, key):
    if idx < len(DEFAULTS_LIST):
        return DEFAULTS_LIST[idx].get(key, DEFAULTS_LIST[0].get(key, 0.0))
    return DEFAULTS_LIST[0].get(key, 0.0)

def save_synth_state(num_synths, amplitude_a, amplitude_b, frequency_a, frequency_b, phase_a, phase_b, harmonics_a, harmonics_b):
    """Save synth/channel values to JSON file"""
    # Store state as a list of dicts, one per synth
    state = []
    for i in range(num_synths):
        synth_state = {
            'amplitude_a': round(float(amplitude_a[i]), 2),
            'amplitude_b': round(float(amplitude_b[i]), 2),
            'frequency_a': round(float(frequency_a[i]), 2),
            'frequency_b': round(float(frequency_b[i]), 2),
            'phase_a': round(float(phase_a[i]), 2),
            'phase_b': round(float(phase_b[i]), 2),
            'harmonics_a': round(float(harmonics_a[i]), 2),
            'harmonics_b': round(float(harmonics_b[i]), 2)
        }
        state.append(synth_state)
    try:
        with open(STATE_FILE, 'w') as f:
            json.dump({'num_synths': num_synths, 'synths': state}, f, indent=2)
    except Exception as e:
        print(f"Warning: Could not save synth state: {e}")

def load_synth_state():
    """Load synth/channel values from JSON file, or return None if not found"""
    if not os.path.exists(STATE_FILE):
        return None
    try:
        with open(STATE_FILE, 'r') as f:
            state = json.load(f)
        # Return None if structure is not as expected
        if 'num_synths' not in state or 'synths' not in state:
            return None
        return state
    except Exception as e:
        print(f"Warning: Could not load synth state: {e}")
        return None

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
                

        # Try to load persistent state
        num_synths = len(synths)
        state = load_synth_state()
        if state and state.get('num_synths', num_synths) == num_synths and isinstance(state.get('synths'), list):
            synth_states = state['synths']
            amplitude_a = [s.get('amplitude_a', get_default_for_synth(i, 'amplitude_a')) for i, s in enumerate(synth_states)]
            amplitude_b = [s.get('amplitude_b', get_default_for_synth(i, 'amplitude_b')) for i, s in enumerate(synth_states)]
            frequency_a = [s.get('frequency_a', get_default_for_synth(i, 'frequency_a')) for i, s in enumerate(synth_states)]
            frequency_b = [s.get('frequency_b', get_default_for_synth(i, 'frequency_b')) for i, s in enumerate(synth_states)]
            phase_a = [s.get('phase_a', get_default_for_synth(i, 'phase_a')) for i, s in enumerate(synth_states)]
            phase_b = [s.get('phase_b', get_default_for_synth(i, 'phase_b')) for i, s in enumerate(synth_states)]
            harmonics_a = [s.get('harmonics_a', get_default_for_synth(i, 'harmonics_a')) for i, s in enumerate(synth_states)]
            harmonics_b = [s.get('harmonics_b', get_default_for_synth(i, 'harmonics_b')) for i, s in enumerate(synth_states)]
            print(f"{Colors.YELLOW}Loaded synth state from {STATE_FILE}{Colors.END}")
        else:
            amplitude_a = [get_default_for_synth(i, 'amplitude_a') for i in range(num_synths)]
            amplitude_b = [get_default_for_synth(i, 'amplitude_b') for i in range(num_synths)]
            frequency_a = [get_default_for_synth(i, 'frequency_a') for i in range(num_synths)]
            frequency_b = [get_default_for_synth(i, 'frequency_b') for i in range(num_synths)]
            harmonics_a = [get_default_for_synth(i, 'harmonics_a') for i in range(num_synths)]
            harmonics_b = [get_default_for_synth(i, 'harmonics_b') for i in range(num_synths)]
            # Set default phase offsets for 3-phase simulation
            if num_synths == 3:
                phase_a = [0, 120, -120]
                phase_b = [0, 120, -120]
            else:
                phase_a = [get_default_for_synth(i, 'phase_a') for i in range(num_synths)]
                phase_b = [get_default_for_synth(i, 'phase_b') for i in range(num_synths)]

        # Control state for each encoder - now includes selection mode and timing
        selection_timeout = 60.0  # 60 seconds timeout for individual selection
        
        # Track selection mode: 'all' = all synths, 'individual' = specific synth/channel
        selection_mode = {
            'amplitude_a': 'all',
            'amplitude_b': 'all', 
            'frequency': 'all',    # Frequency always affects all synths
            'phase': 'all',
            'harmonics': 'all'
        }
        
        # Track when individual mode was last activated (for timeout)
        selection_time = {
            'amplitude_a': 0,
            'amplitude_b': 0,
            'frequency': 0,
            'phase': 0,
            'harmonics': 0
        }
        
        # Active synth/channel when in individual mode
        active_synth = {
            'amplitude_a': 0,  # Which synth this encoder controls in individual mode
            'amplitude_b': 0,
            'frequency': 0,    # Not used (frequency always controls all)
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
                # Truncate all values to 2 decimal places before sending
                amp_a = round(float(amplitude_a[i]), 2)
                amp_b = round(float(amplitude_b[i]), 2)
                freq_a = round(float(frequency_a[i]), 2)
                freq_b = round(float(frequency_b[i]), 2)
                ph_a = round(float(phase_a[i]), 2)
                ph_b = round(float(phase_b[i]), 2)
                synth.set_amplitude('a', amp_a)
                synth.set_amplitude('b', amp_b)
                synth.set_frequency('a', freq_a)
                synth.set_frequency('b', freq_b)
                synth.set_phase('a', ph_a)
                synth.set_phase('b', ph_b)
                print(f"{Colors.GREEN}    ✓ Synth {i + 1} configured{Colors.END}")
            except Exception as e:
                print(f"{Colors.YELLOW}    ✗ Synth {i + 1} warning: {e}{Colors.END}")
            # Note: harmonics will be implemented as frequency adjustment
        
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
        print(f"   {Colors.RED}0x36 - Amplitude A (all synths by default, button for individual){Colors.END}")
        print(f"   {Colors.ORANGE}0x37 - Amplitude B (all synths by default, button for individual){Colors.END}")
        print(f"   {Colors.GREEN}0x38 - Frequency (all synths simultaneously){Colors.END}")
        print(f"   {Colors.BLUE}0x39 - Phase (all synths by default, button for individual){Colors.END}")
        print(f"   {Colors.HEADER}0x3a - Harmonics (all synths by default, button for individual){Colors.END}")

        print(f"\n{Colors.BOLD}{Colors.YELLOW}Current Settings:{Colors.END}")
        for i in range(num_synths):
            print(f"   {Colors.CYAN}Synth {i + 1} - Ch A: {Colors.RED}Amp={amplitude_a[i]:.0f}%{Colors.END}, {Colors.GREEN}Freq={frequency_a[i]:.1f}Hz{Colors.END}, {Colors.BLUE}Phase={phase_a[i]:.0f}°{Colors.END}, {Colors.HEADER}Harm={harmonics_a[i]:.0f}%{Colors.END}")
            print(f"   {Colors.CYAN}Synth {i + 1} - Ch B: {Colors.ORANGE}Amp={amplitude_b[i]:.0f}%{Colors.END}, {Colors.GREEN}Freq={frequency_b[i]:.1f}Hz{Colors.END}, {Colors.BLUE}Phase={phase_b[i]:.0f}°{Colors.END}, {Colors.HEADER}Harm={harmonics_b[i]:.0f}%{Colors.END}")
        
        print(f"\n{Colors.BOLD}{Colors.YELLOW}Usage Instructions:{Colors.END}")
        print(f"   • {Colors.CYAN}Default Mode{Colors.END}: All encoders affect all synths simultaneously")
        print(f"   • {Colors.RED}Amplitude A/B{Colors.END}: Press button to select individual synth (60s timeout)")
        print(f"   • {Colors.GREEN}Frequency{Colors.END}: Always controls all synths together")
        print(f"   • {Colors.BLUE}Phase{Colors.END}: Default controls all synths Ch B, press to select individual synth/channel (60s timeout)")
        print(f"   • {Colors.HEADER}Harmonics{Colors.END}: Press to select individual synth/channel (60s timeout)")
        print(f"   • {Colors.YELLOW}Hold button{Colors.END}: Reset parameter to default value")
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
            'num_synths': num_synths,
            'selection_mode': selection_mode,
            'selection_time': selection_time,
            'selection_timeout': selection_timeout
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
                          hold_threshold, led_colors, amplitude_a, amplitude_b, 
                          frequency_a, frequency_b, phase_a, phase_b, harmonics_a, harmonics_b,
                          active_synth, active_channel, num_synths, selection_mode, selection_time, selection_timeout):
    """Handle button presses for all encoders with hold detection"""
    # Track if button was held for each function
    if not hasattr(handle_encoder_buttons, "was_held"):
        handle_encoder_buttons.was_held = {func: False for func in ['amplitude_a', 'amplitude_b', 'frequency', 'phase', 'harmonics']}
    was_held = handle_encoder_buttons.was_held
    # Track if release should be blocked after reset
    if not hasattr(handle_encoder_buttons, "block_release"):
        handle_encoder_buttons.block_release = {func: False for func in ['amplitude_a', 'amplitude_b', 'frequency', 'phase', 'harmonics']}
    block_release = handle_encoder_buttons.block_release

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
            was_held[func] = False

        elif not button.value and button_pressed[func]:
            # Button is being held down - check for hold duration
            hold_duration = time.time() - button_press_time[func]
            if hold_duration >= hold_threshold:
                # Long hold detected - reset to defaults
                button_pressed[func] = False  # Prevent multiple resets
                was_held[func] = True
                block_release[func] = True


                if func == 'amplitude_a':
                    # Reset amplitude A based on current selection mode
                    if selection_mode[func] == 'all':
                        # Reset all synths
                        for i in range(num_synths):
                            amplitude_a[i] = get_default_for_synth(i, 'amplitude_a')
                            synths[i].set_amplitude('a', round(float(amplitude_a[i]), 2))
                        print(f"\n{Colors.RED}Amplitude A Reset: All synths = {amplitude_a[0]:.0f}%{Colors.END}")
                    else:
                        # Reset only active synth
                        synth_idx = active_synth[func]
                        amplitude_a[synth_idx] = get_default_for_synth(synth_idx, 'amplitude_a')
                        synths[synth_idx].set_amplitude('a', amplitude_a[synth_idx])
                        print(f"\n{Colors.RED}Amplitude A Reset: Synth {synth_idx + 1} = {amplitude_a[synth_idx]:.0f}%{Colors.END}")

                elif func == 'amplitude_b':
                    # Reset amplitude B based on current selection mode
                    if selection_mode[func] == 'all':
                        # Reset all synths
                        for i in range(num_synths):
                            amplitude_b[i] = get_default_for_synth(i, 'amplitude_b')
                            synths[i].set_amplitude('b', round(float(amplitude_b[i]), 2))
                        print(f"\n{Colors.ORANGE}Amplitude B Reset: All synths = {amplitude_b[0]:.0f}%{Colors.END}")
                    else:
                        # Reset only active synth
                        synth_idx = active_synth[func]
                        amplitude_b[synth_idx] = get_default_for_synth(synth_idx, 'amplitude_b')
                        synths[synth_idx].set_amplitude('b', amplitude_b[synth_idx])
                        print(f"\n{Colors.ORANGE}Amplitude B Reset: Synth {synth_idx + 1} = {amplitude_b[synth_idx]:.0f}%{Colors.END}")

                elif func == 'frequency':
                    # Reset frequency for all synths (always affects all)
                    for i in range(num_synths):
                        frequency_a[i] = get_default_for_synth(i, 'frequency_a')
                        frequency_b[i] = get_default_for_synth(i, 'frequency_b')
                        synths[i].set_frequency('a', round(float(frequency_a[i]), 2))
                        synths[i].set_frequency('b', round(float(frequency_b[i]), 2))
                    print(f"\n{Colors.GREEN}Frequency Reset: All synths = {frequency_a[0]:.1f}Hz{Colors.END}")

                elif func == 'phase':
                    # Reset phase based on current selection mode
                    if selection_mode[func] == 'all':
                        # Reset all synths, both channels
                        for i in range(num_synths):
                            phase_a[i] = get_default_for_synth(i, 'phase_a')
                            phase_b[i] = get_default_for_synth(i, 'phase_b')
                            synths[i].set_phase('a', round(float(phase_a[i]), 2))
                            synths[i].set_phase('b', round(float(phase_b[i]), 2))
                        print(f"\n{Colors.BLUE}Phase Reset: All synths Ch A = {phase_a[0]:.0f}°, Ch B = {phase_b[0]:.0f}°{Colors.END}")
                    else:
                        # Reset active synth and channel
                        synth_idx = active_synth[func]
                        channel = active_channel[func]
                        if channel == 'a':
                            phase_a[synth_idx] = get_default_for_synth(synth_idx, 'phase_a')
                            synths[synth_idx].set_phase('a', round(float(phase_a[synth_idx]), 2))
                            print(f"\n{Colors.BLUE}Phase Reset: Synth {synth_idx + 1} Ch A = {phase_a[synth_idx]:.0f}°{Colors.END}")
                        else:
                            phase_b[synth_idx] = get_default_for_synth(synth_idx, 'phase_b')
                            synths[synth_idx].set_phase('b', round(float(phase_b[synth_idx]), 2))
                            print(f"\n{Colors.BLUE}Phase Reset: Synth {synth_idx + 1} Ch B = {phase_b[synth_idx]:.0f}°{Colors.END}")

                elif func == 'harmonics':
                    # Reset harmonics based on current selection mode
                    if selection_mode[func] == 'all':
                        # Reset all synths and channels
                        for i in range(num_synths):
                            harmonics_a[i] = get_default_for_synth(i, 'harmonics')
                            harmonics_b[i] = get_default_for_synth(i, 'harmonics')
                            synths[i].clear_harmonics('a')
                            synths[i].clear_harmonics('b')
                        print(f"\n{Colors.HEADER}Harmonics Reset: All synths/channels = {harmonics_a[0]:.0f}%{Colors.END}")
                    else:
                        # Reset active synth and channel
                        synth_idx = active_synth[func]
                        channel = active_channel[func]
                        if channel == 'a':
                            harmonics_a[synth_idx] = get_default_for_synth(synth_idx, 'harmonics')
                            synths[synth_idx].clear_harmonics('a')
                            print(f"\n{Colors.HEADER}Harmonics Reset: Synth {synth_idx + 1} Ch A = {harmonics_a[synth_idx]:.0f}%{Colors.END}")
                        else:
                            harmonics_b[synth_idx] = get_default_for_synth(synth_idx, 'harmonics')
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

            # If release should be blocked after reset, skip selection mode change
            if block_release[func]:
                block_release[func] = False
                was_held[func] = False
                continue

            # Only process as short press if it was shorter than hold threshold
            if hold_duration < hold_threshold:
                # Short press: switch to individual mode or cycle through targets
                if func == 'frequency':
                    print(f"\nFrequency encoder always controls all synths simultaneously")
                elif func in ['amplitude_a', 'amplitude_b']:
                    if selection_mode[func] == 'all':
                        # Switch to individual mode
                        selection_mode[func] = 'individual'
                        selection_time[func] = time.time()
                        active_synth[func] = 0  # Start with synth 1
                        print(f"\n{func.replace('_', ' ').title()}: Switched to individual mode - Synth {active_synth[func] + 1}")
                    else:
                        # Cycle through synths in individual mode, then back to all mode
                        if active_synth[func] < num_synths - 1:
                            active_synth[func] += 1
                            selection_time[func] = time.time()  # Reset timeout
                            print(f"\n{func.replace('_', ' ').title()}: Switched to Synth {active_synth[func] + 1}")
                        else:
                            # After last synth, go back to all mode
                            selection_mode[func] = 'all'
                            print(f"\n{func.replace('_', ' ').title()}: Switched back to ALL synths mode")

                elif func in ['phase', 'harmonics']:
                    if selection_mode[func] == 'all':
                        # Switch to individual mode
                        selection_mode[func] = 'individual'
                        selection_time[func] = time.time()
                        active_synth[func] = 0  # Start with synth 1
                        active_channel[func] = 'a'  # Start with channel A
                        print(f"\n{func.title()}: Switched to individual mode - Synth {active_synth[func] + 1} Channel {active_channel[func].upper()}")
                    else:
                        # Cycle through all synth/channel combinations, then back to all mode
                        if active_channel[func] == 'a':
                            active_channel[func] = 'b'
                            selection_time[func] = time.time()  # Reset timeout
                            print(f"\n{func.title()}: Switched to Synth {active_synth[func] + 1} Channel {active_channel[func].upper()}")
                        else:
                            # Channel B -> check if we can go to next synth
                            if active_synth[func] < num_synths - 1:
                                active_channel[func] = 'a'
                                active_synth[func] += 1
                                selection_time[func] = time.time()  # Reset timeout
                                print(f"\n{func.title()}: Switched to Synth {active_synth[func] + 1} Channel {active_channel[func].upper()}")
                            else:
                                # After last synth/channel, go back to all mode
                                selection_mode[func] = 'all'
                                print(f"\n{func.title()}: Switched back to ALL synths Ch B mode")

                # Show current status for button presses
                if func != 'frequency':
                    print(f"Mode: {selection_mode[func].upper()}")
                    for i in range(num_synths):
                        print(f"Synth {i + 1} - Ch A: Amp={amplitude_a[i]:.0f}%, Freq={frequency_a[i]:.1f}Hz, Phase={phase_a[i]:.0f}°, Harm={harmonics_a[i]:.0f}%")
                        print(f"Synth {i + 1} - Ch B: Amp={amplitude_b[i]:.0f}%, Freq={frequency_b[i]:.1f}Hz, Phase={phase_b[i]:.0f}°, Harm={harmonics_b[i]:.0f}%")

                time.sleep(0.1)  # Debounce


def check_selection_timeouts(selection_mode, selection_time, selection_timeout):
    """Check for timeout of individual selection mode and revert to 'all' mode"""
    current_time = time.time()
    timeout_occurred = False
    
    for func in ['amplitude_a', 'amplitude_b', 'phase', 'harmonics']:
        if selection_mode[func] == 'individual':
            if current_time - selection_time[func] > selection_timeout:
                selection_mode[func] = 'all'
                timeout_occurred = True
                print(f"\n{Colors.YELLOW}{func.replace('_', ' ').title()}: Timeout - reverted to ALL synths mode{Colors.END}")
    
    return timeout_occurred


def handle_encoder_rotation(encoders, synths, last_positions, amplitude_a, amplitude_b, 
                           frequency_a, frequency_b, phase_a, phase_b, harmonics_a, harmonics_b,
                           active_synth, active_channel, num_synths, selection_mode):
    """Handle encoder rotation for all encoders"""
    for func in ['amplitude_a', 'amplitude_b', 'frequency', 'phase', 'harmonics']:
        encoder = encoders[func]
        if encoder is None:
            continue
        position = encoder.position
        if position != last_positions[func]:
            # Calculate change
            delta = position - last_positions[func]
            changed = False
            if func == 'amplitude_a':
                delta_val = delta
                if selection_mode[func] == 'all':
                    for i in range(num_synths):
                        amplitude_a[i] = max(0, min(100, amplitude_a[i] + delta_val))
                        synths[i].set_amplitude('a', round(float(amplitude_a[i]), 2))
                    print(f"{Colors.RED}Amplitude A: All synths = {amplitude_a[0]:.0f}%{Colors.END}")
                else:
                    synth_idx = active_synth[func]
                    amplitude_a[synth_idx] = max(0, min(100, amplitude_a[synth_idx] + delta_val))
                    synths[synth_idx].set_amplitude('a', round(float(amplitude_a[synth_idx]), 2))
                    print(f"{Colors.RED}Amplitude A: Synth {synth_idx + 1} = {amplitude_a[synth_idx]:.0f}%{Colors.END}")
                changed = True
            elif func == 'amplitude_b':
                delta_val = delta
                if selection_mode[func] == 'all':
                    for i in range(num_synths):
                        amplitude_b[i] = max(0, min(100, amplitude_b[i] + delta_val))
                        synths[i].set_amplitude('b', round(float(amplitude_b[i]), 2))
                    print(f"{Colors.ORANGE}Amplitude B: All synths = {amplitude_b[0]:.0f}%{Colors.END}")
                else:
                    synth_idx = active_synth[func]
                    amplitude_b[synth_idx] = max(0, min(100, amplitude_b[synth_idx] + delta_val))
                    synths[synth_idx].set_amplitude('b', round(float(amplitude_b[synth_idx]), 2))
                    print(f"{Colors.ORANGE}Amplitude B: Synth {synth_idx + 1} = {amplitude_b[synth_idx]:.0f}%{Colors.END}")
                changed = True
            elif func == 'frequency':
                delta_val = delta * 0.1
                for i in range(num_synths):
                    frequency_a[i] = max(20, min(70, frequency_a[i] + delta_val))
                    frequency_b[i] = max(20, min(70, frequency_b[i] + delta_val))
                    synths[i].set_frequency('a', round(float(frequency_a[i]), 2))
                    synths[i].set_frequency('b', round(float(frequency_b[i]), 2))
                print(f"{Colors.GREEN}Frequency: All synths = {frequency_a[0]:.1f}Hz{Colors.END}")
                changed = True
            elif func == 'phase':
                delta_val = delta
                if selection_mode[func] == 'all':
                    for i in range(num_synths):
                        phase_b[i] = max(-360, min(360, phase_b[i] + delta_val))
                        synths[i].set_phase('b', round(float(phase_b[i]), 2))
                    print(f"{Colors.BLUE}Phase: All synths Ch B = {phase_b[0]:.0f}°{Colors.END}")
                else:
                    synth_idx = active_synth[func]
                    channel = active_channel[func]
                    if channel == 'a':
                        phase_a[synth_idx] = max(-360, min(360, phase_a[synth_idx] + delta_val))
                        synths[synth_idx].set_phase('a', round(float(phase_a[synth_idx]), 2))
                        print(f"{Colors.BLUE}Phase: Synth {synth_idx + 1} Ch A = {phase_a[synth_idx]:.0f}°{Colors.END}")
                    else:
                        phase_b[synth_idx] = max(-360, min(360, phase_b[synth_idx] + delta_val))
                        synths[synth_idx].set_phase('b', round(float(phase_b[synth_idx]), 2))
                        print(f"{Colors.BLUE}Phase: Synth {synth_idx + 1} Ch B = {phase_b[synth_idx]:.0f}°{Colors.END}")
                changed = True
            elif func == 'harmonics':
                delta_val = delta
                if selection_mode[func] == 'all':
                    for i in range(num_synths):
                        harmonics_a[i] = max(0, min(100, harmonics_a[i] + delta_val))
                        harmonics_b[i] = max(0, min(100, harmonics_b[i] + delta_val))
                        if harmonics_a[i] > 0:
                            synths[i].add_harmonic('a', 5, harmonics_a[i])
                        else:
                            synths[i].clear_harmonics('a')
                        if harmonics_b[i] > 0:
                            synths[i].add_harmonic('b', 5, harmonics_b[i])
                        else:
                            synths[i].clear_harmonics('b')
                    print(f"{Colors.HEADER}Harmonics: All synths/channels = {harmonics_a[0]:.0f}% (5th harmonic){Colors.END}")
                else:
                    synth_idx = active_synth[func]
                    channel = active_channel[func]
                    if channel == 'a':
                        harmonics_a[synth_idx] = max(0, min(100, harmonics_a[synth_idx] + delta_val))
                        if harmonics_a[synth_idx] > 0:
                            synths[synth_idx].add_harmonic('a', 5, harmonics_a[synth_idx])
                        else:
                            synths[synth_idx].clear_harmonics('a')
                        print(f"{Colors.HEADER}Harmonics: Synth {synth_idx + 1} Ch A = {harmonics_a[synth_idx]:.0f}% (5th harmonic){Colors.END}")
                    else:
                        harmonics_b[synth_idx] = max(0, min(100, harmonics_b[synth_idx] + delta_val))
                        if harmonics_b[synth_idx] > 0:
                            synths[synth_idx].add_harmonic('b', 5, harmonics_b[synth_idx])
                        else:
                            synths[synth_idx].clear_harmonics('b')
                        print(f"{Colors.HEADER}Harmonics: Synth {synth_idx + 1} Ch B = {harmonics_b[synth_idx]:.0f}% (5th harmonic){Colors.END}")
                changed = True
            last_positions[func] = position
            if changed:
                save_synth_state(num_synths, amplitude_a, amplitude_b, frequency_a, frequency_b, phase_a, phase_b, harmonics_a, harmonics_b)


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
        selection_mode = system['selection_mode']
        selection_time = system['selection_time']
        selection_timeout = system['selection_timeout']
        
        try:
            # Button state tracking for all encoders (with hold timing)
            button_pressed = {func: False for func in ['amplitude_a', 'amplitude_b', 'frequency', 'phase', 'harmonics']}
            button_press_time = {func: 0 for func in ['amplitude_a', 'amplitude_b', 'frequency', 'phase', 'harmonics']}
            hold_threshold = 1.0  # Hold for 1 second to trigger reset
            
            while True:
                try:
                    # Check for timeouts and revert to "all synths" mode if needed
                    check_selection_timeouts(selection_mode, selection_time, selection_timeout)
                    
                    # Handle button presses for all encoders
                    handle_encoder_buttons(encoders, buttons, pixels, synths, button_pressed, 
                                         button_press_time, hold_threshold, led_colors, 
                                         amplitude_a, amplitude_b, frequency_a, 
                                         frequency_b, phase_a, phase_b, harmonics_a, harmonics_b,
                                         active_synth, active_channel, num_synths, selection_mode, 
                                         selection_time, selection_timeout)
                    
                    # Handle encoder rotation for all encoders
                    handle_encoder_rotation(encoders, synths, last_positions, amplitude_a, 
                                          amplitude_b, frequency_a, frequency_b, phase_a, phase_b, 
                                          harmonics_a, harmonics_b, active_synth, active_channel, 
                                          num_synths, selection_mode)
                    
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
