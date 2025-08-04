#!/usr/bin/env python3
"""
NHP_Synth Main Control Program

I2C rotary encoder amplitude control interface for the ESP32 DDS synthesizer.
"""

import os
import time
import threading
import multiprocessing
from utils.logger_setup import setup_logger
from utils.command_queue import process_command_queue
from web_dashboard.web_server import create_app
from synth_control import SynthStateManager, SystemInitializer, Encoder, EncoderManager

logger = setup_logger("DEBUG")

STATE_FILE = os.path.join(os.path.dirname(__file__), 'config', 'synth_state.json')
DEFAULTS_FILE = os.path.join(os.path.dirname(__file__), 'config', 'defaults.json')


def main():
    """Main program for multi-encoder function-specific control"""

    # Instantiate SynthStateManager
    state = SynthStateManager(STATE_FILE, DEFAULTS_FILE)

    try:
        # Initialize the complete system (hardware only)
        system = SystemInitializer.initialize_system(state)

        # Extract hardware device objects and info
        encoders = system['encoders']
        buttons = system['buttons']
        pixels = system['pixels']
        synths = system['synths']
        led_colors = system['led_colors']
        num_synths = system['num_synths']

        # State management: load the state and assign synths
        state.num_synths = num_synths

        # Wrap hardware encoders and pixels in Encoder objects
        encoder_objs = {
            func: Encoder(encoders[func], buttons[func], pixels[func])
            for func in encoders
        }
        encoder_manager = EncoderManager(encoder_objs, led_colors, state, 1, synths)

        # Create a multiprocessing queue for commands
        command_queue = multiprocessing.Queue()

        # Start Flask-SocketIO app in a background thread
        flask_app, socketio = create_app(command_queue, state)
        def run_socketio():
            # Use threaded=True and allow_unsafe_werkzeug=True to prevent runtime error
            socketio.run(flask_app, host='0.0.0.0', port=5000, debug=False, use_reloader=False, allow_unsafe_werkzeug=True)
        flask_thread = threading.Thread(target=run_socketio, daemon=True)
        flask_thread.start()
        logger.info("Flask-SocketIO dashboard server started on port 5000.")

        try:
            last_save_time = time.time()
            save_interval = 5.0  # seconds
            while True:
                try:
                    # Process queued commands from the dashboard
                    process_command_queue(command_queue, synths, state)
                    encoder_manager.update()
                    now = time.time()
                    if now - last_save_time > save_interval:
                        state.save_state()
                        state.save_defaults()
                        last_save_time = now
                    time.sleep(0.01)  # Small delay to prevent excessive CPU usage

                except KeyboardInterrupt:
                    logger.info("Exiting...")
                    break

            # Clean shutdown
            logger.info("Shutting down...")
            for i, synth in enumerate(synths):
                if not state.synths[i]['auto_on']:
                    command_queue.put({'synth_id': i, 'command': 'set_enabled', 'channel': 'a', 'value': False})
                    command_queue.put({'synth_id': i, 'command': 'set_enabled', 'channel': 'b', 'value': False})
                    logger.info(f"Synth {i} output disable commands queued.")
            
            # Process the shutdown commands
            process_command_queue(command_queue, synths, state)

        finally:
            # Save final state before exiting
            state.save_state()
            state.save_defaults()
            logger.info(f"Final synth state and defaults saved to {STATE_FILE} and {DEFAULTS_FILE}")
            # Close all synthesizer connections
            for synth in synths:
                try:
                    synth.__exit__(None, None, None)  # Manually exit context manager
                except:
                    pass
            # No shutdown needed for Flask-SocketIO thread

    except Exception as e:
        logger.error(f"Error: {e}")

    logger.info("Goodbye!")


if __name__ == '__main__':
    main()
