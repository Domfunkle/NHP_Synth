import os
import json

class SynthStateManager:
    def __init__(self, state_file, defaults_list):
        self.state_file = state_file
        self.defaults_list = defaults_list

    def get_default_for_synth(self, idx, key):
        if idx < len(self.defaults_list):
            return self.defaults_list[idx].get(key, self.defaults_list[0].get(key, 0.0))
        return self.defaults_list[0].get(key, 0.0)

    def save_synth_state(self, num_synths, amplitude_a, amplitude_b, frequency_a, frequency_b, phase_a, phase_b, harmonics_a, harmonics_b):
        """Save synth/channel values to JSON file"""
        state = []
        for i in range(num_synths):
            synth_state = {
                'amplitude_a': round(float(amplitude_a[i]), 2),
                'amplitude_b': round(float(amplitude_b[i]), 2),
                'frequency_a': round(float(frequency_a[i]), 2),
                'frequency_b': round(float(frequency_b[i]), 2),
                'phase_a': round(float(phase_a[i]), 2),
                'phase_b': round(float(phase_b[i]), 2),
                'harmonics_a': harmonics_a[i],
                'harmonics_b': harmonics_b[i]
            }
            state.append(synth_state)
        try:
            with open(self.state_file, 'w') as f:
                json.dump({'num_synths': num_synths, 'synths': state}, f, indent=2)
        except Exception as e:
            print(f"Warning: Could not save synth state: {e}")

    def load_synth_state(self):
        """Load synth/channel values from JSON file, or return None if not found"""
        if not os.path.exists(self.state_file):
            return None
        try:
            with open(self.state_file, 'r') as f:
                state = json.load(f)
            if 'num_synths' not in state or 'synths' not in state:
                return None
            for synth in state['synths']:
                for key in ['harmonics_a', 'harmonics_b']:
                    if key not in synth or not isinstance(synth[key], list):
                        synth[key] = []
            return state
        except Exception as e:
            print(f"Warning: Could not load synth state: {e}")
            return None
