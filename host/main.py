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
from synth_control import SynthInterface, SynthStateManager, SynthDiscovery, SystemInitializer, Colors



# Path for persistent synth state
STATE_FILE = os.path.join(os.path.dirname(__file__), 'synth_state.json')
DEFAULTS_FILE = os.path.join(os.path.dirname(__file__), 'defaults.json')

# Load per-synth DEFAULTS from defaults.json
try:
    with open(DEFAULTS_FILE, 'r') as f:
        defaults_data = json.load(f)
    if isinstance(defaults_data, dict) and 'synths' in defaults_data and isinstance(defaults_data['synths'], list):
        DEFAULTS_LIST = defaults_data['synths']
    elif isinstance(defaults_data, list):
        DEFAULTS_LIST = defaults_data
    else:
        DEFAULTS_LIST = [defaults_data]
except Exception as e:
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

# Instantiate SynthStateManager
synth_state_manager = SynthStateManager(STATE_FILE, DEFAULTS_LIST)
get_default_for_synth = synth_state_manager.get_default_for_synth
save_synth_state = synth_state_manager.save_synth_state
load_synth_state = synth_state_manager.load_synth_state


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
                            harmonics_a[i] = []
                            harmonics_b[i] = []
                            synths[i].clear_harmonics('a')
                            synths[i].clear_harmonics('b')
                        print(f"\n{Colors.HEADER}Harmonics Reset: All synths/channels = 0%{Colors.END}")
                    else:
                        # Reset active synth and channel
                        synth_idx = active_synth[func]
                        channel = active_channel[func]
                        if channel == 'a':
                            harmonics_a[synth_idx] = []
                            synths[synth_idx].clear_harmonics('a')
                            print(f"\n{Colors.HEADER}Harmonics Reset: Synth {synth_idx + 1} Ch A = 0%{Colors.END}")
                        else:
                            harmonics_b[synth_idx] = []
                            synths[synth_idx].clear_harmonics('b')
                            print(f"\n{Colors.HEADER}Harmonics Reset: Synth {synth_idx + 1} Ch B = 0%{Colors.END}")

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
                    def harmonics_summary(hlist):
                        if not hlist:
                            return "None"
                        return "; ".join(f"{h['order']}: {h['amplitude']}% ({h['phase']}°)" for h in hlist)
                    for i in range(num_synths):
                        print(f"Synth {i + 1} - Ch A: Amp={amplitude_a[i]:.0f}%, Freq={frequency_a[i]:.1f}Hz, Phase={phase_a[i]:.0f}°, Harm=[{harmonics_summary(harmonics_a[i])}]")
                        print(f"Synth {i + 1} - Ch B: Amp={amplitude_b[i]:.0f}%, Freq={frequency_b[i]:.1f}Hz, Phase={phase_b[i]:.0f}°, Harm=[{harmonics_summary(harmonics_b[i])}]")

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
                    new_vals = [amplitude_a[i] + delta_val for i in range(num_synths)]
                    if all(0 <= val <= 100 for val in new_vals):
                        try:
                            for i in range(num_synths):
                                synths[i].set_amplitude('a', round(float(new_vals[i]), 2))
                            for i in range(num_synths):
                                amplitude_a[i] = new_vals[i]
                            print(f"{Colors.RED}Amplitude A: All synths = {amplitude_a[0]:.0f}%{Colors.END}")
                            changed = True
                        except ValueError as e:
                            print(f"{Colors.YELLOW}Amplitude A update aborted: {e}{Colors.END}")
                    else:
                        print(f"{Colors.YELLOW}Amplitude A update aborted: One or more channels would exceed hardware limits (0-100%).{Colors.END}")
                else:
                    synth_idx = active_synth[func]
                    new_val = max(0, min(100, amplitude_a[synth_idx] + delta_val))
                    try:
                        synths[synth_idx].set_amplitude('a', round(float(new_val), 2))
                        amplitude_a[synth_idx] = new_val
                        print(f"{Colors.RED}Amplitude A: Synth {synth_idx + 1} = {amplitude_a[synth_idx]:.0f}%{Colors.END}")
                        changed = True
                    except ValueError as e:
                        print(f"{Colors.YELLOW}Amplitude A update aborted: {e}{Colors.END}")
            elif func == 'amplitude_b':
                delta_val = delta
                if selection_mode[func] == 'all':
                    new_vals = [amplitude_b[i] + delta_val for i in range(num_synths)]
                    if all(0 <= val <= 100 for val in new_vals):
                        try:
                            for i in range(num_synths):
                                synths[i].set_amplitude('b', round(float(new_vals[i]), 2))
                            for i in range(num_synths):
                                amplitude_b[i] = new_vals[i]
                            print(f"{Colors.ORANGE}Amplitude B: All synths = {amplitude_b[0]:.0f}%{Colors.END}")
                            changed = True
                        except ValueError as e:
                            print(f"{Colors.YELLOW}Amplitude B update aborted: {e}{Colors.END}")
                    else:
                        print(f"{Colors.YELLOW}Amplitude B update aborted: One or more channels would exceed hardware limits (0-100%).{Colors.END}")
                else:
                    synth_idx = active_synth[func]
                    new_val = max(0, min(100, amplitude_b[synth_idx] + delta_val))
                    try:
                        synths[synth_idx].set_amplitude('b', round(float(new_val), 2))
                        amplitude_b[synth_idx] = new_val
                        print(f"{Colors.ORANGE}Amplitude B: Synth {synth_idx + 1} = {amplitude_b[synth_idx]:.0f}%{Colors.END}")
                        changed = True
                    except ValueError as e:
                        print(f"{Colors.YELLOW}Amplitude B update aborted: {e}{Colors.END}")
            elif func == 'frequency':
                delta_val = delta * 0.1
                new_freq_a = [max(20, min(70, frequency_a[i] + delta_val)) for i in range(num_synths)]
                new_freq_b = [max(20, min(70, frequency_b[i] + delta_val)) for i in range(num_synths)]
                try:
                    for i in range(num_synths):
                        synths[i].set_frequency('a', round(float(new_freq_a[i]), 2))
                        synths[i].set_frequency('b', round(float(new_freq_b[i]), 2))
                    for i in range(num_synths):
                        frequency_a[i] = new_freq_a[i]
                        frequency_b[i] = new_freq_b[i]
                    print(f"{Colors.GREEN}Frequency: All synths = {frequency_a[0]:.1f}Hz{Colors.END}")
                    changed = True
                except ValueError as e:
                    print(f"{Colors.YELLOW}Frequency update aborted: {e}{Colors.END}")
            elif func == 'phase':
                delta_val = delta
                if selection_mode[func] == 'all':
                    new_vals = [phase_b[i] + delta_val for i in range(num_synths)]
                    # Check all are within limits before updating any
                    if all(-360 <= val <= 360 for val in new_vals):
                        try:
                            for i in range(num_synths):
                                synths[i].set_phase('b', round(float(new_vals[i]), 2))
                            for i in range(num_synths):
                                phase_b[i] = new_vals[i]
                            print(f"{Colors.BLUE}Phase: All synths Ch B = {phase_b[0]:.0f}°{Colors.END}")
                            changed = True
                        except ValueError as e:
                            print(f"{Colors.YELLOW}Phase update aborted: {e}{Colors.END}")
                    else:
                        print(f"{Colors.YELLOW}Phase update aborted: One or more channels would exceed hardware limits (-360 to +360°).{Colors.END}")
                else:
                    synth_idx = active_synth[func]
                    channel = active_channel[func]
                    if channel == 'a':
                        new_val = max(-360, min(360, phase_a[synth_idx] + delta_val))
                        try:
                            synths[synth_idx].set_phase('a', round(float(new_val), 2))
                            phase_a[synth_idx] = new_val
                            print(f"{Colors.BLUE}Phase: Synth {synth_idx + 1} Ch A = {phase_a[synth_idx]:.0f}°{Colors.END}")
                            changed = True
                        except ValueError as e:
                            print(f"{Colors.YELLOW}Phase update aborted: {e}{Colors.END}")
                    else:
                        new_val = max(-360, min(360, phase_b[synth_idx] + delta_val))
                        try:
                            synths[synth_idx].set_phase('b', round(float(new_val), 2))
                            phase_b[synth_idx] = new_val
                            print(f"{Colors.BLUE}Phase: Synth {synth_idx + 1} Ch B = {phase_b[synth_idx]:.0f}°{Colors.END}")
                            changed = True
                        except ValueError as e:
                            print(f"{Colors.YELLOW}Phase update aborted: {e}{Colors.END}")
            elif func == 'harmonics':
                delta_val = delta
                # For this example, we will only adjust the amplitude of the first harmonic in the list (if present), or add a default if empty
                def update_harmonics_list(hlist, order, phase, delta_val):
                    # Find harmonic with given order/phase, else add new
                    for h in hlist:
                        if h['order'] == order and h['phase'] == phase:
                            h['amplitude'] = max(0, min(100, h['amplitude'] + delta_val))
                            return
                    # If not found, add new
                    hlist.append({'order': order, 'amplitude': max(0, min(100, delta_val)), 'phase': phase})

                if selection_mode[func] == 'all':
                    for i in range(num_synths):
                        # Channel A: 3rd and 5th, phase 0
                        harmonics_a[i] = [
                            {'order': 3, 'amplitude': 0, 'phase': 0},
                            {'order': 5, 'amplitude': 0, 'phase': 0}
                        ] if not harmonics_a[i] else harmonics_a[i]
                        for h in harmonics_a[i]:
                            update_harmonics_list(harmonics_a[i], h['order'], h['phase'], delta_val)
                        synths[i].clear_harmonics('a')
                        for h in harmonics_a[i]:
                            if h['amplitude'] > 0:
                                synths[i].add_harmonic('a', h['order'], h['amplitude'], phase=h['phase'])
                        # Channel B: 3rd and 5th, phase 180
                        harmonics_b[i] = [
                            {'order': 3, 'amplitude': 0, 'phase': 180},
                            {'order': 5, 'amplitude': 0, 'phase': 180}
                        ] if not harmonics_b[i] else harmonics_b[i]
                        for h in harmonics_b[i]:
                            update_harmonics_list(harmonics_b[i], h['order'], h['phase'], delta_val)
                        synths[i].clear_harmonics('b')
                        for h in harmonics_b[i]:
                            if h['amplitude'] > 0:
                                synths[i].add_harmonic('b', h['order'], h['amplitude'], phase=h['phase'])
                    print(f"{Colors.HEADER}Harmonics: All synths/channels updated (orders 3 & 5){Colors.END}")
                else:
                    synth_idx = active_synth[func]
                    channel = active_channel[func]
                    if channel == 'a':
                        harmonics_a[synth_idx] = [
                            {'order': 3, 'amplitude': 0, 'phase': 0},
                            {'order': 5, 'amplitude': 0, 'phase': 0}
                        ] if not harmonics_a[synth_idx] else harmonics_a[synth_idx]
                        for h in harmonics_a[synth_idx]:
                            update_harmonics_list(harmonics_a[synth_idx], h['order'], h['phase'], delta_val)
                        synths[synth_idx].clear_harmonics('a')
                        for h in harmonics_a[synth_idx]:
                            if h['amplitude'] > 0:
                                synths[synth_idx].add_harmonic('a', h['order'], h['amplitude'], phase=h['phase'])
                        print(f"{Colors.HEADER}Harmonics: Synth {synth_idx + 1} Ch A updated (orders 3 & 5){Colors.END}")
                    else:
                        harmonics_b[synth_idx] = [
                            {'order': 3, 'amplitude': 0, 'phase': 180},
                            {'order': 5, 'amplitude': 0, 'phase': 180}
                        ] if not harmonics_b[synth_idx] else harmonics_b[synth_idx]
                        for h in harmonics_b[synth_idx]:
                            update_harmonics_list(harmonics_b[synth_idx], h['order'], h['phase'], delta_val)
                        synths[synth_idx].clear_harmonics('b')
                        for h in harmonics_b[synth_idx]:
                            if h['amplitude'] > 0:
                                synths[synth_idx].add_harmonic('b', h['order'], h['amplitude'], phase=h['phase'])
                        print(f"{Colors.HEADER}Harmonics: Synth {synth_idx + 1} Ch B updated (orders 3 & 5, 180° phase){Colors.END}")
                changed = True
            last_positions[func] = position
            if changed:
                save_synth_state(num_synths, amplitude_a, amplitude_b, frequency_a, frequency_b, phase_a, phase_b, harmonics_a, harmonics_b)


def main():
    """Main program for multi-encoder function-specific control"""
    try:
        # Initialize the complete system
        system = SystemInitializer.initialize_system(
            get_default_for_synth,
            save_synth_state,
            load_synth_state,
            STATE_FILE
        )
        
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
