#!/usr/bin/env python3
"""
Test routine for NHP_Synth EncoderManager and SynthStateManager
"""
import time
import logging
import json
import os
import random
from synth_control import SynthStateManager, SystemInitializer, EncoderManager

# Set up logger
logger = logging.getLogger("NHP_Synth")
logger.setLevel(logging.DEBUG)
handler = logging.StreamHandler()
formatter = logging.Formatter('%(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)

STATE_FILE = os.path.join(os.path.dirname(__file__), 'config', 'synth_state.json')
DEFAULTS_FILE = os.path.join(os.path.dirname(__file__), 'config', 'defaults.json')



# Combined MockEncoder class for testing (position, button, pixel)
class MockEncoder:
    def __init__(self, position=0, button_value=True, pixel=None):
        self.position = position
        self._button_value = button_value
        self.pixel = pixel
    @property
    def button(self):
        class Button:
            def __init__(self, outer):
                self._outer = outer
            @property
            def value(self):
                return self._outer._button_value
            @value.setter
            def value(self, v):
                self._outer._button_value = v
        return Button(self)

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
            'harmonics_a': [
                {'order': 3, 'amplitude': 0, 'phase': 0},
                {'order': 5, 'amplitude': 0, 'phase': 0}
            ],
            'harmonics_b': [
                {'order': 3, 'amplitude': 0, 'phase': 180},
                {'order': 5, 'amplitude': 0, 'phase': 180}
            ]
        }]

    # Instantiate SynthStateManager
    state = SynthStateManager(STATE_FILE, DEFAULTS_LIST)
    get_defaults = state.get_defaults
    load_state = state.load_state

    # Initialize system as in main()
    system = SystemInitializer.initialize_system()
    encoders = system['encoders']
    pixels = system['pixels']
    led_colors = system['led_colors']
    synths = system['synths']
    num_synths = system['num_synths']

    # Wrap hardware encoders and pixels in Encoder objects using mocks
    from synth_control.encoder import Encoder
    from synth_control.encoder_manager import EncoderManager
    mock_encoder_objs = {}
    for func in encoders:
        pos = encoders[func].position if encoders[func] else 0
        pixel = pixels[func]
        mock_encoder = MockEncoder(position=pos, button_value=True, pixel=pixel)
        mock_encoder_objs[func] = Encoder(mock_encoder, pixel)
    # Pass the shared state to EncoderManager so it can update state directly
    encoder_manager = EncoderManager(mock_encoder_objs, led_colors, state, synths)

    # Load state if available, else use defaults
    loaded_state = load_state()
    if loaded_state and loaded_state.get('num_synths', num_synths) == num_synths and isinstance(loaded_state.get('synths'), list):
        state.num_synths = num_synths
        # Fill in missing/default values for each synth
        for i in range(num_synths):
            if i >= len(state.synths):
                state.synths.append({})
            synth = state.synths[i]
        for key in ['amplitude_a', 'amplitude_b', 'frequency_a', 'frequency_b', 'phase_a', 'phase_b']:
            synth.setdefault(key, get_defaults(i, key))
        if 'harmonics_a' not in synth or not isinstance(synth['harmonics_a'], list) or not synth['harmonics_a']:
            synth['harmonics_a'] = [
                {'order': 3, 'amplitude': 0, 'phase': 0},
                {'order': 5, 'amplitude': 0, 'phase': 0}
            ]
        if 'harmonics_b' not in synth or not isinstance(synth['harmonics_b'], list) or not synth['harmonics_b']:
            synth['harmonics_b'] = [
                {'order': 3, 'amplitude': 0, 'phase': 180},
                {'order': 5, 'amplitude': 0, 'phase': 180}
            ]
        logger.info(f"Loaded synth state from {STATE_FILE}")
    else:
        state.num_synths = num_synths
        state.synths = []
        for i in range(num_synths):
            synth = {
                'amplitude_a': get_defaults(i, 'amplitude_a'),
                'amplitude_b': get_defaults(i, 'amplitude_b'),
                'frequency_a': get_defaults(i, 'frequency_a'),
                'frequency_b': get_defaults(i, 'frequency_b'),
                'harmonics_a': [
                    {'order': 3, 'amplitude': 0, 'phase': 0},
                    {'order': 5, 'amplitude': 0, 'phase': 0}
                ],
                'harmonics_b': [
                    {'order': 3, 'amplitude': 0, 'phase': 180},
                    {'order': 5, 'amplitude': 0, 'phase': 180}
                ],
                'phase_a': get_defaults(i, 'phase_a'),
                'phase_b': get_defaults(i, 'phase_b'),
            }
            state.synths.append(synth)
    # Save initial state
    state.save_state()

    # Systematically test each encoder: rotate forward, backward, press, repeat for each selection mode
    for func, encoder in mock_encoder_objs.items():
        logger.info(f"\n--- Testing encoder: {func} ---")
        # For each selection mode (cycle through twice)
        for cycle in range(num_synths * 3 - 1):
            # Rotate forward
            logger.info(f"\nCycle {cycle + 1}: Rotating {func} forward")
            encoder._last_position += random.randint(1, 10)  # Simulate rotation
            encoder._encoder._button_value = True  # Not pressed
            encoder_manager.update()
            print(state.synths[0])  # Print state of first synth for debugging
            
            # Rotate backward
            logger.info(f"\nCycle {cycle + 1}: Rotating {func} backward")
            encoder._last_position -= random.randint(1, 10)  # Simulate rotation
            encoder._encoder._button_value = True  # Not pressed
            encoder_manager.update()
            print(state.synths[0])  # Print state of first synth for debugging

            # Press button (simulate short press)
            logger.info(f"\nCycle {cycle + 1}: Pressing {func} button")
            encoder._encoder._button_value = False  # Pressed
            encoder_manager.update()
            time.sleep(0.1)
            encoder._encoder._button_value = True  # Release
            encoder_manager.update()
            print(state.synths[0])  # Print state of first synth for debugging

    # Final save of state
    state.save_state()


if __name__ == '__main__':
    test_encoder_emulation()
