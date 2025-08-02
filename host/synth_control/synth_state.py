import os
import json
import logging
import copy
logger = logging.getLogger("NHP_Synth")

class SynthStateManager:
    def __init__(self, state_file, defaults_file):
        self.state_file = state_file
        self.defaults_file = defaults_file
        self.defaults = []
        self.synths = {}
        self.num_synths = 0
        self.selection_mode = None

        self.defaults = copy.deepcopy(self.load_defaults())
        self.synths = copy.deepcopy(self.load_state()).get("synths", [])

    def get_defaults(self, idx, key):
        if idx < len(self.defaults):
            return self.defaults[idx].get(key, self.defaults[0].get(key, 0.0))
        return self.defaults[0].get(key, 0.0)

    def _return_defaults(self):
        """Save and Return the default synths configuration."""
        self.save_defaults()
        return copy.deepcopy(self.defaults)

    def save_defaults(self):
        """Save the defaults to the defaults JSON file."""
        try:
            with open(self.defaults_file, 'w') as f:
                json.dump(self.defaults, f, indent=2)
        except Exception as e:
            logger.warning(f"Could not save defaults: {e}")

    def load_defaults(self):
        """Load defaults from the defaults JSON file, or use hardcoded defaults if file does not exist."""
        default_data = []
        for i in range(3):
            default_data.append({
                "amplitude_a": 96.0,
                "amplitude_b": 50.0,
                "frequency_a": 50.0,
                "frequency_b": 50.0,
                "phase_a": 0.0 if i == 0 else (120.0 if i == 1 else -120.0),
                "phase_b": 0.0 if i == 0 else (120.0 if i == 1 else -120.0),
                "harmonics_a": [],
                "harmonics_b": [
                    {"id": 0, "order": 5, "amplitude": 0, "phase": 0},
                    {"id": 1, "order": 7, "amplitude": 0, "phase": 0},
                    {"id": 2, "order": 11, "amplitude": 0, "phase": 0},
                    {"id": 3, "order": 13, "amplitude": 0, "phase": 0}
                ]
            })

        if not os.path.exists(self.defaults_file):
            self.defaults = default_data
            return self._return_defaults()
        try:
            with open(self.defaults_file, 'r') as f:
                data = json.load(f)

            self.defaults = copy.deepcopy(data)
            return self.defaults
        except Exception as e:
            logger.warning(f"Could not load defaults: {e}")
            self.defaults = default_data
            return self._return_defaults()

    def save_state(self):
        """Save the current synth/channel values to JSON file."""
        try:
            with open(self.state_file, 'w') as f:
                json.dump({'num_synths': self.num_synths, 'synths': self.synths}, f, indent=2)
        except Exception as e:
            logger.warning(f"Could not save synth state: {e}")

    def load_state(self):
        """Load synth/channel values from JSON file, update internal state, and return the state dict."""
        if not os.path.exists(self.state_file):
            self.num_synths = len(self.defaults)
            self.synths = copy.deepcopy(self.defaults)
            self.save_state()
            return copy.deepcopy(self.defaults)
        try:
            with open(self.state_file, 'r') as f:
                state = json.load(f)
            if 'num_synths' not in state or 'synths' not in state:
                return copy.deepcopy(self.defaults)
            self.num_synths = state.get('num_synths', len(self.defaults))
            self.synths = state.get('synths', copy.deepcopy(self.defaults))
            self.num_synths = len(self.synths)
            # Ensure harmonics lists are lists
            for synth in self.synths:
                for key in ['harmonics_a', 'harmonics_b']:
                    if key not in synth or not isinstance(synth[key], list):
                        synth[key] = []
            return state
        except Exception as e:
            logger.warning(f"Could not load synth state: {e}")
            return copy.deepcopy(self.defaults)
