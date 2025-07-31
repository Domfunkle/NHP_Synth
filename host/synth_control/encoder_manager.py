"""
New EncoderManager using Encoder abstraction.
Handles button press, hold, release, rotation, and LED logic for each encoder.
"""
import time
import logging
from .encoder import Encoder

logger = logging.getLogger("NHP_Synth")

class EncoderManager:
    def __init__(self, encoders, led_colors, state=None, hold_threshold=1.0, synth_interface=None):
        """
        :param encoders: dict mapping function names to Encoder instances
        :param led_colors: dict mapping function names to default LED colors (RGB tuples)
        :param hold_threshold: seconds to consider a button as held
        :param state: SynthStateManager instance to access synth state
        :param synth_interface: SynthInterface instance to control synths
        """
        self.encoders = encoders
        self.led_colors = led_colors
        self.hold_threshold = hold_threshold
        self.state = state
        self.synth_interface = synth_interface
        self.button_hold_time = {k: None for k in encoders}
        self.was_held = {k: False for k in encoders}
        self.selection_mode = {k: {'synth': 'all', 'ch': 'all'} for k in encoders}
        self.state.selection_mode = self.selection_mode  # Share selection mode with state manager
        self.selection_mode_last_changed = {k: time.time() for k in encoders}  # Track last change time for each func

    # --- Public interface ---
    def update(self):
        """Call this in your main loop to process all encoders and handle selection_mode timeout."""
        now = time.time()
        # Timeout logic for selection_mode
        for func in self.selection_mode:
            last_changed = self.selection_mode_last_changed.get(func, now)
            if now - last_changed > 60:
                if self.selection_mode[func] != {'synth': 'all', 'ch': 'all'}:
                    self.selection_mode[func] = {'synth': 'all', 'ch': 'all'}
                    self.selection_mode_last_changed[func] = now
                    logger.info(f"Selection mode for {func} timed out, reverted to all/all")
        for func, encoder in self.encoders.items():
            # Handle rotation
            delta = encoder.delta
            if delta != 0:
                self.on_rotate(func, delta)
                
            if encoder.button_pressed:
                if self.button_hold_time[func] is None:
                    self.button_hold_time[func] = now
                    self.was_held[func] = False
                elif not self.was_held[func] and now - self.button_hold_time[func] > self.hold_threshold:
                    self.was_held[func] = True
                    self.on_hold(func)
            else:
                if self.button_hold_time[func] is not None:
                    if self.was_held[func]:
                        self.on_release_after_hold(func)
                    else:
                        self.on_press(func)
                    self.button_hold_time[func] = None
                    self.was_held[func] = False

    def on_rotate(self, func, delta):
        """Handle rotation for each encoder based on its own selection_mode and func. Reset inactivity timer."""
        self.selection_mode_last_changed[func] = time.time()  # Reset inactivity timer on rotation
        mode = self.selection_mode.get(func, {'synth': 'all', 'ch': 'all'})
        handler_map = {
            'voltage': self._handle_voltage,
            'current': self._handle_current,
            'phase': self._handle_phase,
            'frequency': self._handle_frequency,
            'harmonics': self._handle_harmonics
        }
        handler = handler_map.get(func, self._handle_generic)
        handler(delta, mode)

    def on_press(self, func):
        """Handle short button press for each encoder: cycle selection modes for that encoder only."""
        logger.info(f"{func}: Button pressed (cycle selection mode)")
        self.selection_mode_last_changed[func] = time.time()  # Update last changed time
        self.encoders[func].set_pixel((0, 0, 255))
        time.sleep(0.1)
        self.encoders[func].set_pixel(self.led_colors[func])

        num_synths = self.state.num_synths
        channels = ['a', 'b']

        # Limit selection modes depending on the function
        if func == 'voltage':
            # Only switch between synths, always channel 'a'
            selection_modes = [{'synth': 'all', 'ch': 'a'}]
            for synth_idx in range(num_synths):
                selection_modes.append({'synth': synth_idx, 'ch': 'a'})
        elif func == 'current':
            # Only switch between synths, always channel 'b'
            selection_modes = [{'synth': 'all', 'ch': 'b'}]
            for synth_idx in range(num_synths):
                selection_modes.append({'synth': synth_idx, 'ch': 'b'})
        elif func == 'frequency':
            # dont switch anything, leave as all/all
            selection_modes = [{'synth': 'all', 'ch': 'all'}]
        else:
            # Default: all synths/channels, then each synth/channel
            selection_modes = [{'synth': 'all', 'ch': 'all'}]
            for synth_idx in range(num_synths):
                for ch in channels:
                    selection_modes.append({'synth': synth_idx, 'ch': ch})

        current_mode = self.selection_mode.get(func, selection_modes[0])
        try:
            current_index = selection_modes.index(current_mode)
        except ValueError:
            current_index = 0
        next_index = (current_index + 1) % len(selection_modes)
        self.selection_mode[func] = selection_modes[next_index]
        logger.info(f"Selection mode for {func} changed to Synth {self.selection_mode[func]['synth']}, Channel {self.selection_mode[func]['ch']}")

    def on_hold(self, func):
        """Handle button hold: send synth commands using self.state.defaults for the selected synth/channel."""
        logger.info(f"{func}: Button held")
        self.encoders[func].set_pixel((255, 255, 255))

        mode = self.selection_mode.get(func, {'synth': 'all', 'ch': 'all'})
        defaults = self.state.defaults
        synths = self.state.synths
        synth_interface = self.synth_interface

        # Helper to send command for a synth/channel
        def send_default(synth_id, channel):
            if func == 'voltage':
                value = defaults[synth_id]['amplitude_a']
                synths[synth_id]['amplitude_a'] = value
                synth_interface[synth_id].set_amplitude('a', value)
            elif func == 'current':
                value = defaults[synth_id]['amplitude_b']
                synths[synth_id]['amplitude_b'] = value
                synth_interface[synth_id].set_amplitude('b', value)
            elif func == 'phase':
                channels = ['a', 'b'] if channel == 'all' else [channel]
                for ch in channels:
                    phase_key = f'phase_{ch}'
                    value = defaults[synth_id][phase_key]
                    synths[synth_id][phase_key] = value
                    synth_interface[synth_id].set_phase(ch, value)
            elif func == 'frequency':
                for ch in ['a', 'b']:
                    freq_key = f'frequency_{ch}'
                    value = defaults[synth_id][freq_key]
                    synths[synth_id][freq_key] = value
                    synth_interface[synth_id].set_frequency(ch, value)
            elif func == 'harmonics':
                harmonics_channels = ['a', 'b'] if channel == 'all' else [channel]

                for ch in harmonics_channels:
                    synth_interface[synth_id].clear_harmonics(ch)

                    harmonics_key = f'harmonics_{ch}'
                    default_harmonics = defaults[synth_id].get(harmonics_key, [])
                    synth_harmonics = synths[synth_id].get(harmonics_key, [])
                    # If synth_harmonics is empty but default_harmonics is not, add missing harmonics
                    if not synth_harmonics and default_harmonics:
                        for h in default_harmonics:
                            synth_harmonics.append({
                                'id': h.get('id'),
                                'order': h.get('order', 0),
                                'amplitude': h.get('amplitude', 0),
                                'phase': h.get('phase', 0)
                            })
                    if not default_harmonics and not synth_harmonics:
                        continue  # Nothing to set
                    # Set all harmonics in defaults
                    for j, h in enumerate(default_harmonics):
                        if j >= len(synth_harmonics):
                            break
                        amp = h.get('amplitude', 0)
                        order = h.get('order', 0)
                        phase = h.get('phase', 0)
                        synth_harmonics[j]['amplitude'] = amp
                        synth_harmonics[j]['order'] = order
                        synth_harmonics[j]['phase'] = phase
                        value = {'order': order, 'amplitude': amp, 'phase': phase}
                        synth_interface[synth_id].set_harmonics(ch, value)
                    # Set extra harmonics (not in defaults) to amplitude 0
                    extra_count = len(synth_harmonics) - len(default_harmonics)
                    for j in range(len(default_harmonics), len(synth_harmonics)):
                        synth_harmonics[j]['amplitude'] = 0
                        order = synth_harmonics[j].get('order', 0)
                        phase = synth_harmonics[j].get('phase', 0)
                        value = {'order': order, 'amplitude': 0, 'phase': phase}
                        synth_interface[synth_id].set_harmonics(ch, value)
                    # Remove extra harmonics from state
                    if extra_count > 0:
                        del synth_harmonics[len(default_harmonics):]

        # Determine which synths/channels to send
        if mode['synth'] == 'all':
            for synth_id in range(self.state.num_synths):
                if func == 'frequency':
                    send_default(synth_id, None)
                elif func == 'harmonics':
                    channels = ['a', 'b'] if mode['ch'] == 'all' else [mode['ch']]
                    for ch in channels:
                        send_default(synth_id, ch)
                else:
                    send_default(synth_id, mode['ch'])
        else:
            synth_id = mode['synth']
            if func == 'frequency':
                send_default(synth_id, None)
            elif func == 'harmonics':
                channels = ['a', 'b'] if mode['ch'] == 'all' else [mode['ch']]
                for ch in channels:
                    send_default(synth_id, ch)
            else:
                send_default(synth_id, mode['ch'])

    def on_release_after_hold(self, func):
        """Override this method to handle release after hold for each encoder."""
        logger.info(f"{func}: Button released after hold")
        self.encoders[func].set_pixel(self.led_colors[func])

    def set_led(self, func, color):
        self.encoders[func].set_pixel(color)

    def clear_led(self, func):
        self.encoders[func].clear_pixel()

    # --- Internal handler methods ---
    def _handle_voltage(self, delta, mode):
        if mode['synth'] == 'all':
            logger.info(f"[ALL][voltage] Rotated {delta} (adjust voltage placeholder)")
            # Calculate new voltages first, but check for out-of-bounds
            would_exceed = any((self.state.synths[i]['amplitude_a'] + delta) < 0 or (self.state.synths[i]['amplitude_a'] + delta) > 100 for i in range(self.state.num_synths))
            if would_exceed:
                logger.info("At least one synth would exceed voltage bounds, skipping command.")
                return
            for i in range(self.state.num_synths):
                old_voltage = self.state.synths[i]['amplitude_a']
                new_voltage = round(max(0, min(100, old_voltage + delta)), 2)
                self.state.synths[i]['amplitude_a'] = new_voltage
                if old_voltage != new_voltage:
                    self.synth_interface[i].set_amplitude('a', new_voltage)
        else:
            logger.info(f"[{mode}][voltage] Rotated {delta} (adjust voltage placeholder)")
            synth_id = mode['synth']
            channel = mode['ch']
            old_voltage = self.state.synths[synth_id]['amplitude_a']
            new_voltage = round(max(0, min(100, old_voltage + delta)), 2)
            self.state.synths[synth_id]['amplitude_a'] = new_voltage
            if old_voltage != new_voltage:
                self.synth_interface[synth_id].set_amplitude(channel, new_voltage)
            

    def _handle_current(self, delta, mode):
        if mode['synth'] == 'all':
            logger.info(f"[ALL][current] Rotated {delta} (adjust current placeholder)")
            # Check if any synth would exceed bounds for channel b
            would_exceed = any((self.state.synths[i]['amplitude_b'] + delta) < 0 or (self.state.synths[i]['amplitude_b'] + delta) > 100 for i in range(self.state.num_synths))
            if would_exceed:
                logger.info("At least one synth would exceed current bounds, skipping command.")
                return
            for i in range(self.state.num_synths):
                old_current = self.state.synths[i]['amplitude_b']
                new_current = round(max(0, min(100, old_current + delta)), 2)
                self.state.synths[i]['amplitude_b'] = new_current
                if old_current != new_current:
                    self.synth_interface[i].set_amplitude('b', new_current)
        else:
            logger.info(f"[{mode}][current] Rotated {delta} (adjust current placeholder)")
            synth_id = mode['synth']
            channel = mode['ch']
            old_current = self.state.synths[synth_id]['amplitude_b']
            new_current = round(max(0, min(100, old_current + delta)), 2)
            self.state.synths[synth_id]['amplitude_b'] = new_current
            if old_current != new_current:
                self.synth_interface[synth_id].set_amplitude(channel, new_current)

    def _handle_phase(self, delta, mode):
        channel = mode['ch']
        phase_key = f'phase_{channel}'
        if mode['synth'] == 'all':
            logger.info(f"[ALL][phase] Rotated {delta} (adjust phase placeholder)")
            would_exceed = any((self.state.synths[i]['phase_b'] + delta) < -360 or (self.state.synths[i]['phase_b'] + delta) > 360 for i in range(self.state.num_synths))
            if would_exceed:
                logger.info("At least one synth would exceed phase bounds, skipping command.")
                return
            for i in range(self.state.num_synths):
                old_phase = self.state.synths[i]['phase_b']
                new_phase = round(max(-360, min(360, old_phase + delta)), 2)
                self.state.synths[i]['phase_b'] = new_phase
                if old_phase != new_phase:
                    self.synth_interface[i].set_phase('b', new_phase)
        else:
            logger.info(f"[{mode}][phase] Rotated {delta} (adjust phase placeholder)")
            synth_id = mode['synth']
            old_phase = self.state.synths[synth_id][phase_key]
            new_phase = round(max(-360, min(360, old_phase + delta)), 2)
            if (old_phase + delta) < -360 or (old_phase + delta) > 360:
                logger.info("Synth would exceed phase bounds, skipping command.")
                return
            self.state.synths[synth_id][phase_key] = new_phase
            if old_phase != new_phase:
                self.synth_interface[synth_id].set_phase(channel, new_phase)

    def _handle_frequency(self, delta, mode):
        logger.info(f"[ALL][frequency] Rotated {delta} (adjust frequency for all synths/channels)")
        # Check if any synth/channel would exceed frequency bounds
        would_exceed = any(
            (self.state.synths[i]['frequency_a'] + delta) < 20 or (self.state.synths[i]['frequency_a'] + delta) > 70 or
            (self.state.synths[i]['frequency_b'] + delta) < 20 or (self.state.synths[i]['frequency_b'] + delta) > 70
            for i in range(self.state.num_synths)
        )
        if would_exceed:
            logger.info("At least one synth/channel would exceed frequency bounds, skipping command.")
            return
        for i in range(self.state.num_synths):
            for ch in ['a', 'b']:
                freq_key = f'frequency_{ch}'
                old_freq = self.state.synths[i][freq_key]
                new_freq = round(max(20, min(70, old_freq + delta)), 2)
                self.state.synths[i][freq_key] = new_freq
                if old_freq != new_freq:
                    self.synth_interface[i].set_frequency(ch, new_freq)

    def _handle_harmonics(self, delta, mode):
        channels = ['a', 'b'] if mode['ch'] == 'all' else [mode['ch']]
        # Determine which synths to update
        if mode['synth'] == 'all':
            # Check bounds for all synths
            for ch in channels:
                harmonics_key = f'harmonics_{ch}'
                logger.info(f"[{mode}][harmonics] Rotated {delta} (adjust harmonics for channel {ch})")
                would_exceed = any(
                    (self.state.synths[i][harmonics_key][j]['amplitude'] + delta) < 0 or
                    (self.state.synths[i][harmonics_key][j]['amplitude'] + delta) > 100
                    for i in range(self.state.num_synths)
                    for j in range(len(self.state.synths[i][harmonics_key]))
                )
                if would_exceed:
                    logger.info("At least one synth/channel would exceed harmonics bounds, skipping command.")
                    return
            for i in range(self.state.num_synths):
                for ch in channels:
                    harmonics_key = f'harmonics_{ch}'
                    for j in range(len(self.state.synths[i][harmonics_key])):
                        harmonic = self.state.synths[i][harmonics_key][j]
                        old_amp = harmonic['amplitude']
                        new_amp = round(max(0, min(100, old_amp + delta)), 2)
                        harmonic['amplitude'] = new_amp
                        value = {
                            'id': harmonic.get('id'),
                            'order': harmonic.get('order'),
                            'amplitude': new_amp,
                            'phase': round(harmonic.get('phase', 0), 2)
                        }
                        if old_amp != new_amp:
                            self.synth_interface[i].set_harmonics(ch, value)
                            logger.info(f"Updated harmonics for synth {i}, channel {ch}, id {value['id']} order {value['order']} to amplitude {new_amp}")
            logger.info(f"Applied harmonics changes for all synths on channel(s) {channels}")
        else:
            # Only update the selected synth
            synth_id = mode['synth']
            for ch in channels:
                harmonics_key = f'harmonics_{ch}'
                logger.info(f"[Synth {synth_id}][harmonics] Rotated {delta} (adjust harmonics for channel {ch})")
                would_exceed = any(
                    (self.state.synths[synth_id][harmonics_key][j]['amplitude'] + delta) < 0 or
                    (self.state.synths[synth_id][harmonics_key][j]['amplitude'] + delta) > 100
                    for j in range(len(self.state.synths[synth_id][harmonics_key]))
                )
                if would_exceed:
                    logger.info("Synth would exceed harmonics bounds, skipping command.")
                    return
                for j in range(len(self.state.synths[synth_id][harmonics_key])):
                    harmonic = self.state.synths[synth_id][harmonics_key][j]
                    old_amp = harmonic['amplitude']
                    new_amp = round(max(0, min(100, old_amp + delta)), 2)
                    harmonic['amplitude'] = new_amp
                    value = {
                        'id': harmonic.get('id'),
                        'order': harmonic.get('order'),
                        'amplitude': new_amp,
                        'phase': round(harmonic.get('phase', 0), 2)
                    }
                    if old_amp != new_amp:
                        self.synth_interface[synth_id].set_harmonics(ch, value)
                        logger.info(f"Updated harmonics for synth {synth_id}, channel {ch}, id {value['id']} order {value['order']} to amplitude {new_amp}")
            logger.info(f"Applied harmonics changes for synth {synth_id} on channel(s) {channels}")


    def _handle_generic(self, delta, mode):
        logger.info(f"[{mode}][generic] Rotated {delta} (generic placeholder)")
        # TODO: Implement other func actions
