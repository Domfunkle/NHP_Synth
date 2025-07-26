#!/usr/bin/env python3
"""
Test routine for NHP_Synth EncoderManager and SynthStateManager
"""
import time
import logging
import json
import os
import random
from synth_control import SynthStateManager, SystemInitializer, EncoderManager, Colors

# Set up logger
logger = logging.getLogger("NHP_Synth")
logger.setLevel(logging.DEBUG)
handler = logging.StreamHandler()
formatter = logging.Formatter('%(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)

STATE_FILE = os.path.join(os.path.dirname(__file__), 'synth_state.json')
DEFAULTS_FILE = os.path.join(os.path.dirname(__file__), 'defaults.json')

# MockButton class for testing
class MockButton:
    def __init__(self, value=False):
        self._value = value
    @property
    def value(self):
        return self._value
    @value.setter
    def value(self, v):
        self._value = v

def test_encoder_emulation():
    """Test routine to emulate encoder turning and button presses for UI/logging."""
    # delete the state file to start fresh
    if os.path.exists(STATE_FILE):
        os.remove(STATE_FILE)
        logger.debug(f"Deleted existing state file: {STATE_FILE}")

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

    # Initialize system as in main()
    system = SystemInitializer.initialize_system(
        get_default_for_synth,
        save_synth_state,
        load_synth_state,
        STATE_FILE
    )
    encoders = system['encoders']
    buttons = {func: MockButton() for func in ['amplitude_a', 'amplitude_b', 'frequency', 'phase', 'harmonics']}
    pixels = system['pixels']
    synths = system['synths']
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

    button_pressed = {func: False for func in ['amplitude_a', 'amplitude_b', 'frequency', 'phase', 'harmonics']}
    button_press_time = {func: 0 for func in ['amplitude_a', 'amplitude_b', 'frequency', 'phase', 'harmonics']}
    hold_threshold = 1.0  # Hold for 1 second to trigger reset

    def read_synth_state(synth, key):
        try:
            if key == 'amplitude_a':
                synth.get_amplitude('a')
            elif key == 'amplitude_b':
                synth.get_amplitude('b')
            elif key == 'frequency':
                synth.get_frequency('a')
                synth.get_frequency('b')
            elif key == 'phase':
                synth.get_phase('a')
                synth.get_phase('b')
            elif key == 'harmonics':
                synth.get_harmonics('a')
                synth.get_harmonics('b')
        except Exception as e:
            logger.error(f"Error getting state for synth {synth.id} key {key}: {e}")

    # Simulate encoder rotations multiple times
    for key in last_positions:
        # Randomly pick a key from last_positions and simulate a rotation
        last_positions[key] += random.choice([-5, 5])  # Randomly increase or decrease position
        encoder_manager.handle_encoder_rotation(
            encoders, synths, last_positions, amplitude_a, amplitude_b, frequency_a, frequency_b, phase_a, phase_b,
            harmonics_a, harmonics_b, active_synth, active_channel, num_synths, selection_mode
        )

        for synth in synths:
            read_synth_state(synth, key)
        
    # Simulate button presses and then rotations
    for func in ['amplitude_a', 'amplitude_b', 'frequency', 'phase', 'harmonics']:
        # Simulate button press
        button_pressed[func] = True
        button_press_time[func] = time.time()
        encoder_manager.handle_encoder_buttons(
            encoders, buttons, pixels, synths, button_pressed, button_press_time, hold_threshold, led_colors,
            amplitude_a, amplitude_b, frequency_a, frequency_b, phase_a, phase_b, harmonics_a, harmonics_b,
            active_synth, active_channel, num_synths, selection_mode, selection_time, selection_timeout
        )
        button_pressed[func] = False
        # rotate the encoder after button press
        last_positions[func] += random.choice([-5, 5])
        encoder_manager.handle_encoder_rotation(
            encoders, synths, last_positions, amplitude_a, amplitude_b, frequency_a, frequency_b, phase_a, phase_b,
            harmonics_a, harmonics_b, active_synth, active_channel, num_synths, selection_mode
        )
        
        for synth in synths:
            read_synth_state(synth, func)

    # Go through each button, set the selection_mode to 'all' and simulate a button hold beyond the threshold
    for func in ['amplitude_a', 'amplitude_b', 'frequency', 'phase', 'harmonics']:
        selection_mode[func] = 'all'
        button_pressed[func] = True
        buttons[func].value = False
        encoder_manager.was_held[func] = True
        button_press_time[func] = time.time() - hold_threshold - 1.0 # Simulate hold beyond threshold
        encoder_manager.handle_encoder_buttons(
            encoders, buttons, pixels, synths, button_pressed, button_press_time, hold_threshold, led_colors,
            amplitude_a, amplitude_b, frequency_a, frequency_b, phase_a, phase_b, harmonics_a, harmonics_b,
            active_synth, active_channel, num_synths, selection_mode, selection_time, selection_timeout
        )

        for synth in synths:
            read_synth_state(synth, func)

if __name__ == '__main__':
    test_encoder_emulation()
