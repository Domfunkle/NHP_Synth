def process_command_queue(command_queue, synths, state_manager):
    """Process all commands in the multiprocessing queue and dispatch to synths."""
    import logging
    logger = logging.getLogger("NHP_Synth")
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
                if command == 'set_amplitude':
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
                    deleteHarmonic = False
                    id = value.get('id')
                    new_order = value.get('order')
                    amplitude = value.get('amplitude')
                    phase = value.get('phase', 0)
                    channelStr = 'harmonics_' + channel

                    # Check if the id exists and the order is changing
                    original_harmonic = None
                    for harmonic in synth_state[channelStr]:
                        if harmonic['id'] == id:
                            original_harmonic = harmonic
                            break

                    if original_harmonic and original_harmonic['order'] != new_order:
                        # Set original harmonic's amplitude to zero to remove it
                        synth.set_harmonics(channel, {
                            'id': id,
                            'order': original_harmonic['order'],
                            'amplitude': 0,
                            'phase': 0
                        })
                        original_harmonic['amplitude'] = 0

                    # setting the amplitude to 0 deletes the harmonic if order < 3
                    if new_order < 3:
                        value['amplitude'] = 0
                        value['order'] = 3
                        deleteHarmonic = True

                    synth.set_harmonics(channel, value)

                    # Update state
                    # find the element in the harmonics list with the matching id, update it or create a new one
                    for harmonic in synth_state[channelStr]:
                        if harmonic['id'] == id:
                            if deleteHarmonic:
                                synth_state[channelStr].remove(harmonic)
                            else:
                                harmonic['order'] = new_order
                                harmonic['amplitude'] = amplitude
                                harmonic['phase'] = phase
                            break
                    else:
                        synth_state[channelStr].append({
                            'id': id,
                            'order': new_order,
                            'amplitude': amplitude,
                            'phase': phase
                        })

        except Exception as e:
            logger.error(f"Failed to process command from queue: {e}")
