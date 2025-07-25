"""
EncoderManager module for handling encoder button and rotation logic.
"""

import time
import logging
logger = logging.getLogger("NHP_Synth")


class EncoderManager:
    def __init__(self, get_default_for_synth, save_synth_state):
        self.get_default_for_synth = get_default_for_synth
        self.save_synth_state = save_synth_state
        # State for button hold/release
        self.was_held = {func: False for func in ['amplitude_a', 'amplitude_b', 'frequency', 'phase', 'harmonics']}
        self.block_release = {func: False for func in ['amplitude_a', 'amplitude_b', 'frequency', 'phase', 'harmonics']}

    def handle_encoder_buttons(self, encoders, buttons, pixels, synths, button_pressed, button_press_time, 
                              hold_threshold, led_colors, amplitude_a, amplitude_b, 
                              frequency_a, frequency_b, phase_a, phase_b, harmonics_a, harmonics_b,
                              active_synth, active_channel, num_synths, selection_mode, selection_time, selection_timeout):
        """Handle button presses for all encoders with hold detection"""
        was_held = self.was_held
        block_release = self.block_release
        get_default_for_synth = self.get_default_for_synth

        for func in ['amplitude_a', 'amplitude_b', 'frequency', 'phase', 'harmonics']:
            if not encoders[func] or not buttons[func]:
                continue

            button = buttons[func]
            pixel = pixels[func]

            # Check for button press with hold detection
            if not button.value and not button_pressed[func]:
                button_pressed[func] = True
                button_press_time[func] = time.time()
                was_held[func] = False

            elif not button.value and button_pressed[func]:
                hold_duration = time.time() - button_press_time[func]
                if hold_duration >= hold_threshold:
                    button_pressed[func] = False
                    was_held[func] = True
                    block_release[func] = True

                    if func == 'amplitude_a':
                        if selection_mode[func] == 'all':
                            for i in range(num_synths):
                                amplitude_a[i] = get_default_for_synth(i, 'amplitude_a')
                                synths[i].set_amplitude('a', round(float(amplitude_a[i]), 2))
                            logger.info(f"Amplitude A Reset: All synths = {amplitude_a[0]:.0f}%")
                        else:
                            synth_idx = active_synth[func]
                            amplitude_a[synth_idx] = get_default_for_synth(synth_idx, 'amplitude_a')
                            synths[synth_idx].set_amplitude('a', amplitude_a[synth_idx])
                            logger.info(f"Amplitude A Reset: Synth {synth_idx + 1} = {amplitude_a[synth_idx]:.0f}%")
                    elif func == 'amplitude_b':
                        if selection_mode[func] == 'all':
                            for i in range(num_synths):
                                amplitude_b[i] = get_default_for_synth(i, 'amplitude_b')
                                synths[i].set_amplitude('b', round(float(amplitude_b[i]), 2))
                            logger.info(f"Amplitude B Reset: All synths = {amplitude_b[0]:.0f}%")
                        else:
                            synth_idx = active_synth[func]
                            amplitude_b[synth_idx] = get_default_for_synth(synth_idx, 'amplitude_b')
                            synths[synth_idx].set_amplitude('b', amplitude_b[synth_idx])
                            logger.info(f"Amplitude B Reset: Synth {synth_idx + 1} = {amplitude_b[synth_idx]:.0f}%")
                    elif func == 'frequency':
                        for i in range(num_synths):
                            frequency_a[i] = get_default_for_synth(i, 'frequency_a')
                            frequency_b[i] = get_default_for_synth(i, 'frequency_b')
                            synths[i].set_frequency('a', round(float(frequency_a[i]), 2))
                            synths[i].set_frequency('b', round(float(frequency_b[i]), 2))
                        logger.info(f"Frequency Reset: All synths = {frequency_a[0]:.1f}Hz")
                    elif func == 'phase':
                        if selection_mode[func] == 'all':
                            for i in range(num_synths):
                                phase_a[i] = get_default_for_synth(i, 'phase_a')
                                phase_b[i] = get_default_for_synth(i, 'phase_b')
                                synths[i].set_phase('a', round(float(phase_a[i]), 2))
                                synths[i].set_phase('b', round(float(phase_b[i]), 2))
                            logger.info(f"Phase Reset: All synths Ch A = {phase_a[0]:.0f}°, Ch B = {phase_b[0]:.0f}°")
                        else:
                            synth_idx = active_synth[func]
                            channel = active_channel[func]
                            if channel == 'a':
                                phase_a[synth_idx] = get_default_for_synth(synth_idx, 'phase_a')
                                synths[synth_idx].set_phase('a', round(float(phase_a[synth_idx]), 2))
                                logger.info(f"Phase Reset: Synth {synth_idx + 1} Ch A = {phase_a[synth_idx]:.0f}°")
                            else:
                                phase_b[synth_idx] = get_default_for_synth(synth_idx, 'phase_b')
                                synths[synth_idx].set_phase('b', round(float(phase_b[synth_idx]), 2))
                                logger.info(f"Phase Reset: Synth {synth_idx + 1} Ch B = {phase_b[synth_idx]:.0f}°")
                    elif func == 'harmonics':
                        if selection_mode[func] == 'all':
                            for i in range(num_synths):
                                harmonics_a[i] = []
                                harmonics_b[i] = []
                                synths[i].clear_harmonics('a')
                                synths[i].clear_harmonics('b')
                            logger.info(f"Harmonics Reset: All synths/channels = 0%")
                        else:
                            synth_idx = active_synth[func]
                            channel = active_channel[func]
                            if channel == 'a':
                                harmonics_a[synth_idx] = []
                                synths[synth_idx].clear_harmonics('a')
                                logger.info(f"Harmonics Reset: Synth {synth_idx + 1} Ch A = 0%")
                            else:
                                harmonics_b[synth_idx] = []
                                synths[synth_idx].clear_harmonics('b')
                                logger.info(f"Harmonics Reset: Synth {synth_idx + 1} Ch B = 0%")
                    if pixel:
                        pixel.fill((255, 255, 255))
                        time.sleep(0.2)
                        pixel.fill(led_colors[func])

            elif button.value and button_pressed[func]:
                hold_duration = time.time() - button_press_time[func]
                button_pressed[func] = False
                if block_release[func]:
                    block_release[func] = False
                    was_held[func] = False
                    continue
                if hold_duration < hold_threshold:
                    if func == 'frequency':
                        logger.info(f"Frequency encoder always controls all synths simultaneously")
                    elif func in ['amplitude_a', 'amplitude_b']:
                        if selection_mode[func] == 'all':
                            selection_mode[func] = 'individual'
                            selection_time[func] = time.time()
                            active_synth[func] = 0
                            logger.info(f"{func.replace('_', ' ').title()}: Switched to individual mode - Synth {active_synth[func] + 1}")
                        else:
                            if active_synth[func] < num_synths - 1:
                                active_synth[func] += 1
                                selection_time[func] = time.time()
                                logger.info(f"{func.replace('_', ' ').title()}: Switched to Synth {active_synth[func] + 1}")
                            else:
                                selection_mode[func] = 'all'
                                logger.info(f"{func.replace('_', ' ').title()}: Switched back to ALL synths mode")
                    elif func in ['phase', 'harmonics']:
                        if selection_mode[func] == 'all':
                            selection_mode[func] = 'individual'
                            selection_time[func] = time.time()
                            active_synth[func] = 0
                            active_channel[func] = 'a'
                            logger.info(f"{func.title()}: Switched to individual mode - Synth {active_synth[func] + 1} Channel {active_channel[func].upper()}")
                        else:
                            if active_channel[func] == 'a':
                                active_channel[func] = 'b'
                                selection_time[func] = time.time()
                                logger.info(f"{func.title()}: Switched to Synth {active_synth[func] + 1} Channel {active_channel[func].upper()}")
                            else:
                                if active_synth[func] < num_synths - 1:
                                    active_channel[func] = 'a'
                                    active_synth[func] += 1
                                    selection_time[func] = time.time()
                                    logger.info(f"{func.title()}: Switched to Synth {active_synth[func] + 1} Channel {active_channel[func].upper()}")
                                else:
                                    selection_mode[func] = 'all'
                                    logger.info(f"{func.title()}: Switched back to ALL synths Ch B mode")
                    if func != 'frequency':
                        logger.info(f"Mode: {selection_mode[func].upper()}")
                        def harmonics_summary(hlist):
                            if not hlist:
                                return "None"
                            return "; ".join(f"{h['order']}: {h['amplitude']}% ({h['phase']}°)" for h in hlist)
                        for i in range(num_synths):
                            logger.info(f"Synth {i + 1} - Ch A: Amp={amplitude_a[i]:.0f}%, Freq={frequency_a[i]:.1f}Hz, Phase={phase_a[i]:.0f}°, Harm=[{harmonics_summary(harmonics_a[i])}]")
                            logger.info(f"Synth {i + 1} - Ch B: Amp={amplitude_b[i]:.0f}%, Freq={frequency_b[i]:.1f}Hz, Phase={phase_b[i]:.0f}°, Harm=[{harmonics_summary(harmonics_b[i])}]")
                    time.sleep(0.1)

    def check_selection_timeouts(self, selection_mode, selection_time, selection_timeout):
        current_time = time.time()
        timeout_occurred = False
        for func in ['amplitude_a', 'amplitude_b', 'phase', 'harmonics']:
            if selection_mode[func] == 'individual':
                if current_time - selection_time[func] > selection_timeout:
                    selection_mode[func] = 'all'
                    timeout_occurred = True
                    logger.info(f"{func.replace('_', ' ').title()}: Timeout - reverted to ALL synths mode")
        return timeout_occurred

    def handle_encoder_rotation(self, encoders, synths, last_positions, amplitude_a, amplitude_b, 
                               frequency_a, frequency_b, phase_a, phase_b, harmonics_a, harmonics_b,
                               active_synth, active_channel, num_synths, selection_mode):
        for func in ['amplitude_a', 'amplitude_b', 'frequency', 'phase', 'harmonics']:
            encoder = encoders[func]
            if encoder is None:
                continue
            position = encoder.position
            if position != last_positions[func]:
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
                                logger.info(f"Amplitude A: All synths = {amplitude_a[0]:.0f}%")
                                changed = True
                            except ValueError as e:
                                logger.warning(f"Amplitude A update aborted: {e}")
                        else:
                            logger.warning(f"Amplitude A update aborted: One or more channels would exceed hardware limits (0-100%).")
                    else:
                        synth_idx = active_synth[func]
                        new_val = max(0, min(100, amplitude_a[synth_idx] + delta_val))
                        try:
                            synths[synth_idx].set_amplitude('a', round(float(new_val), 2))
                            amplitude_a[synth_idx] = new_val
                            logger.info(f"Amplitude A: Synth {synth_idx + 1} = {amplitude_a[synth_idx]:.0f}%")
                            changed = True
                        except ValueError as e:
                            logger.warning(f"Amplitude A update aborted: {e}")
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
                                logger.info(f"Amplitude B: All synths = {amplitude_b[0]:.0f}%")
                                changed = True
                            except ValueError as e:
                                logger.warning(f"Amplitude B update aborted: {e}")
                        else:
                            logger.warning(f"Amplitude B update aborted: One or more channels would exceed hardware limits (0-100%).")
                    else:
                        synth_idx = active_synth[func]
                        new_val = max(0, min(100, amplitude_b[synth_idx] + delta_val))
                        try:
                            synths[synth_idx].set_amplitude('b', round(float(new_val), 2))
                            amplitude_b[synth_idx] = new_val
                            logger.info(f"Amplitude B: Synth {synth_idx + 1} = {amplitude_b[synth_idx]:.0f}%")
                            changed = True
                        except ValueError as e:
                            logger.warning(f"Amplitude B update aborted: {e}")
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
                        logger.info(f"Frequency: All synths = {frequency_a[0]:.1f}Hz")
                        changed = True
                    except ValueError as e:
                        logger.warning(f"Frequency update aborted: {e}")
                elif func == 'phase':
                    delta_val = delta
                    if selection_mode[func] == 'all':
                        new_vals = [phase_b[i] + delta_val for i in range(num_synths)]
                        if all(-360 <= val <= 360 for val in new_vals):
                            try:
                                for i in range(num_synths):
                                    synths[i].set_phase('b', round(float(new_vals[i]), 2))
                                for i in range(num_synths):
                                    phase_b[i] = new_vals[i]
                                logger.info(f"Phase: All synths Ch B = {phase_b[0]:.0f}°")
                                changed = True
                            except ValueError as e:
                                logger.warning(f"Phase update aborted: {e}")
                        else:
                            logger.warning(f"Phase update aborted: One or more channels would exceed hardware limits (-360 to +360°).")
                    else:
                        synth_idx = active_synth[func]
                        channel = active_channel[func]
                        if channel == 'a':
                            new_val = max(-360, min(360, phase_a[synth_idx] + delta_val))
                            try:
                                synths[synth_idx].set_phase('a', round(float(new_val), 2))
                                phase_a[synth_idx] = new_val
                                logger.info(f"Phase: Synth {synth_idx + 1} Ch A = {phase_a[synth_idx]:.0f}°")
                                changed = True
                            except ValueError as e:
                                logger.warning(f"Phase update aborted: {e}")
                        else:
                            new_val = max(-360, min(360, phase_b[synth_idx] + delta_val))
                            try:
                                synths[synth_idx].set_phase('b', round(float(new_val), 2))
                                phase_b[synth_idx] = new_val
                                logger.info(f"Phase: Synth {synth_idx + 1} Ch B = {phase_b[synth_idx]:.0f}°")
                                changed = True
                            except ValueError as e:
                                logger.warning(f"Phase update aborted: {e}")
                elif func == 'harmonics':
                    delta_val = delta
                    def update_harmonics_list(hlist, order, phase, delta_val):
                        for h in hlist:
                            if h['order'] == order and h['phase'] == phase:
                                h['amplitude'] = max(0, min(100, h['amplitude'] + delta_val))
                                return
                        hlist.append({'order': order, 'amplitude': max(0, min(100, delta_val)), 'phase': phase})
                    if selection_mode[func] == 'all':
                        for i in range(num_synths):
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
                        logger.info(f"Harmonics: All synths/channels updated (orders 3 & 5)")
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
                            logger.info(f"Harmonics: Synth {synth_idx + 1} Ch A updated (orders 3 & 5)")
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
                            logger.info(f"Harmonics: Synth {synth_idx + 1} Ch B updated (orders 3 & 5, 180° phase)")
                changed = True
                last_positions[func] = position
                if changed:
                    self.save_synth_state(num_synths, amplitude_a, amplitude_b, frequency_a, frequency_b, phase_a, phase_b, harmonics_a, harmonics_b)
