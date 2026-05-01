def process_command_queue(command_queue, synths, state_manager):
    """Process all commands in the multiprocessing queue and dispatch to synths."""
    import logging
    logger = logging.getLogger("NHP_Synth")

    def apply_harmonic_update(synth, synth_state, target_channel, harmonic_value):
        """Apply one harmonic update to the target channel and keep state in sync."""
        delete_harmonic = False
        harmonic_id = harmonic_value.get('id')
        new_order = harmonic_value.get('order')
        amplitude = harmonic_value.get('amplitude')
        phase = harmonic_value.get('phase', 0)
        channel_key = 'harmonics_' + target_channel

        # Check if the id exists and the order is changing.
        original_harmonic = None
        for harmonic in synth_state[channel_key]:
            if harmonic['id'] == harmonic_id:
                original_harmonic = harmonic
                break

        if original_harmonic and original_harmonic['order'] != new_order:
            # Set original harmonic's amplitude to zero to remove it.
            synth.set_harmonics(target_channel, {
                'id': harmonic_id,
                'order': original_harmonic['order'],
                'amplitude': 0,
                'phase': 0
            })
            original_harmonic['amplitude'] = 0

        # Setting amplitude to 0 deletes the harmonic if order < 3.
        command_value = dict(harmonic_value)
        if new_order < 3:
            command_value['amplitude'] = 0
            command_value['order'] = 3
            delete_harmonic = True

        synth.set_harmonics(target_channel, command_value)

        # Update in-memory state.
        for harmonic in synth_state[channel_key]:
            if harmonic['id'] == harmonic_id:
                if delete_harmonic:
                    synth_state[channel_key].remove(harmonic)
                else:
                    harmonic['order'] = new_order
                    harmonic['amplitude'] = amplitude
                    harmonic['phase'] = phase
                break
        else:
            synth_state[channel_key].append({
                'id': harmonic_id,
                'order': new_order,
                'amplitude': amplitude,
                'phase': phase
            })

    while not command_queue.empty():
        try:
            cmd = command_queue.get_nowait()
            synth_id = cmd.get('synth_id')
            command = cmd.get('command')
            channel = cmd.get('channel')
            value = cmd.get('value')
            if synth_id is not None and 0 <= synth_id < len(synths):
                synth = synths[synth_id]
                synth_state = state_manager.synths[synth_id]
                if command == 'set_enabled':
                    synth.set_enabled(channel, value)
                    synth_state['enabled'][channel] = value
                elif command == 'set_amplitude':
                    synth.set_amplitude(channel, value)
                    if channel == 'a':
                        synth_state['amplitude_a'] = value
                    elif channel == 'b':
                        synth_state['amplitude_b'] = value
                elif command == 'set_frequency':
                    synth.set_frequency(channel, value)
                    if channel == 'a':
                        synth_state['frequency_a'] = value
                    elif channel == 'b':
                        synth_state['frequency_b'] = value
                elif command == 'set_phase':
                    synth.set_phase(channel, value)
                    if channel == 'a':
                        synth_state['phase_a'] = value
                    elif channel == 'b':
                        synth_state['phase_b'] = value
                elif command == 'set_harmonics':
                    apply_harmonic_update(synth, synth_state, channel, value)

                    # Finite source impedance behavior:
                    # applying current harmonics also injects matching voltage harmonics.
                    if channel == 'b':
                        apply_harmonic_update(synth, synth_state, 'a', value)

        except Exception as e:
            logger.error(f"Failed to process command from queue: {e}")
