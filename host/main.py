#!/usr/bin/env python3
"""
NHP_Synth Main Control Program

I2C rotary encoder amplitude control interface for the ESP32 DDS synthesizer.
"""


import time
import logging
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

# Set up logger
logger = logging.getLogger("NHP_Synth")
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
formatter = logging.Formatter('%(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)

from synth_control import SynthStateManager, SystemInitializer, EncoderManager, Colors

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

# Instantiate EncoderManager
encoder_manager = EncoderManager(get_default_for_synth, save_synth_state)


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
                    # Use EncoderManager for all encoder/button/timeout handling
                    encoder_manager.check_selection_timeouts(selection_mode, selection_time, selection_timeout)
                    encoder_manager.handle_encoder_buttons(
                        encoders, buttons, pixels, synths, button_pressed, button_press_time, hold_threshold, led_colors,
                        amplitude_a, amplitude_b, frequency_a, frequency_b, phase_a, phase_b, harmonics_a, harmonics_b,
                        active_synth, active_channel, num_synths, selection_mode, selection_time, selection_timeout
                    )
                    encoder_manager.handle_encoder_rotation(
                        encoders, synths, last_positions, amplitude_a, amplitude_b, frequency_a, frequency_b, phase_a, phase_b,
                        harmonics_a, harmonics_b, active_synth, active_channel, num_synths, selection_mode
                    )
                    time.sleep(0.01)  # Small delay to prevent excessive CPU usage

                except KeyboardInterrupt:
                    logger.info("Exiting...")
                    break

            # Clean shutdown
            logger.info("Shutting down...")
            for i, synth in enumerate(synths):
                synth.set_amplitude('a', 0)
                synth.set_amplitude('b', 0)
            logger.info("All amplitudes set to 0")

        finally:
            # Close all synthesizer connections
            for synth in synths:
                try:
                    synth.__exit__(None, None, None)  # Manually exit context manager
                except:
                    pass

    except Exception as e:
        logger.error(f"{Colors.RED}Error: {e}{Colors.END}")

    logger.info("Goodbye!")


if __name__ == '__main__':
    main()
