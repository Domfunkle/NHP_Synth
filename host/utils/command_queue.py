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
                    synth.set_harmonics(channel, value)
                    if channel == 'a':
                        synth_state['harmonics_a'] = value
                    elif channel == 'b':
                        synth_state['harmonics_b'] = value
        except Exception as e:
            logger.error(f"Failed to process command from queue: {e}")
