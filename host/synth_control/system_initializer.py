import time
from concurrent.futures import ThreadPoolExecutor, as_completed
import board
import busio
from adafruit_seesaw.seesaw import Seesaw
from adafruit_seesaw.rotaryio import IncrementalEncoder
from adafruit_seesaw import digitalio, neopixel
from .synth_interface import SynthInterface
from .synth_discovery import SynthDiscovery
import logging
import colorsys
logger = logging.getLogger("NHP_Synth")

class SystemInitializer:
    """
    Handles full system initialization for NHP_Synth.
    """
    @staticmethod
    def _expected_synth_count(state_manager):
        defaults = getattr(state_manager, 'defaults', [])
        expected = len(defaults) if isinstance(defaults, list) and defaults else 3
        return max(3, expected)

    @staticmethod
    def _close_synths(synths):
        for synth in synths:
            try:
                synth.__exit__(None, None, None)
            except Exception:
                pass

    @staticmethod
    def _order_endpoints(endpoints, state_manager):
        saved_map = getattr(state_manager, 'synth_device_map', [])
        if not isinstance(saved_map, list) or not saved_map:
            return sorted(endpoints, key=lambda ep: ep.get('path', ''))

        index_by_key = {key: idx for idx, key in enumerate(saved_map)}

        def sort_key(endpoint):
            key = endpoint.get('device_key')
            if key in index_by_key:
                return (0, index_by_key[key])
            return (1, endpoint.get('path', ''))

        return sorted(endpoints, key=sort_key)

    @staticmethod
    def _connect_synths(endpoints):
        synth_init_errors = []
        synths = []
        connected_endpoints = []

        for i, endpoint in enumerate(endpoints):
            device_path = endpoint.get('path')
            device_name = device_path.split('/')[-1] if device_path else f'device-{i}'
            try:
                synth = SynthInterface(port=device_path, id=i)
                synth.__enter__()
                synths.append(synth)
                connected_endpoints.append(endpoint)

                try:
                    enabled_a = synth.get_enabled('a')
                    enabled_b = synth.get_enabled('b')
                    amp_a = synth.get_amplitude('a')
                    amp_b = synth.get_amplitude('b')
                    freq_a = synth.get_frequency('a')
                    freq_b = synth.get_frequency('b')
                    phase_a = synth.get_phase('a')
                    phase_b = synth.get_phase('b')
                    harmonics_a = synth.get_harmonics('a')
                    harmonics_b = synth.get_harmonics('b')
                    logger.debug(
                        f"enabled_a={enabled_a}, enabled_b={enabled_b}, amp_a={amp_a}, amp_b={amp_b}, "
                        f"freq_a={freq_a}, freq_b={freq_b}, phase_a={phase_a}, phase_b={phase_b}, "
                        f"harmonics_a={harmonics_a}, harmonics_b={harmonics_b}"
                    )
                    try:
                        synth.set_frequency('a', freq_a)
                        synth.set_frequency('b', freq_b)
                        freq_a_check = synth.get_frequency('a')
                        freq_b_check = synth.get_frequency('b')
                        if freq_a != freq_a_check or freq_b != freq_b_check:
                            synth_init_errors.append(
                                f"Synth {i} ({device_name}) frequency round-trip mismatch: "
                                f"a={freq_a}->{freq_a_check}, b={freq_b}->{freq_b_check}"
                            )
                        else:
                            logger.debug(f"✓ Synth {i} frequency round-trip OK")
                    except Exception as e:
                        synth_init_errors.append(
                            f"Synth {i} ({device_name}) frequency round-trip error: {e}"
                        )

                    logger.info(f"✓ Synth {i} Comms OK ({endpoint.get('device_key', 'unknown-key')})")
                except Exception as comms_e:
                    logger.error(f"Could not read parameters from {device_name}: {comms_e}")
                    synth_init_errors.append(f"Synth {i} ({device_name}) comms error: {comms_e}")
            except Exception as e:
                logger.error(f"✗ Failed to connect to {device_name}: {e}")
                synth_init_errors.append(f"Synth {i} ({device_name}) connection error: {e}")

        if synth_init_errors:
            logger.warning("Synthesizer issues:")
            for err in synth_init_errors:
                logger.warning(f"  {err}")

        return synths, connected_endpoints

    @staticmethod
    def _sync_synths_to_state(synths, state_manager):
        for i, synth in enumerate(synths):
            for ch in ['a', 'b']:
                try:
                    synth.clear_harmonics(ch)
                except Exception as e:
                    logger.warning(f"Synth {i} failed to clear harmonics on channel {ch}: {e}")

            synth_state = state_manager.synths[i] if i < len(state_manager.synths) else None
            if not synth_state:
                continue

            try:
                if not synth_state.get('auto_on', False):
                    synth.set_enabled('a', False)
                    synth.set_enabled('b', False)
                else:
                    synth.set_enabled('a', synth_state.get('enabled', {}).get('a', False))
                    synth.set_enabled('b', synth_state.get('enabled', {}).get('b', False))

                synth.set_amplitude('a', synth_state.get('amplitude_a', 0))
                synth.set_amplitude('b', synth_state.get('amplitude_b', 0))
                synth.set_frequency('a', synth_state.get('frequency_a', 50))
                synth.set_frequency('b', synth_state.get('frequency_b', 50))
                synth.set_phase('a', synth_state.get('phase_a', 0))
                synth.set_phase('b', synth_state.get('phase_b', 0))

                for ch in ['a', 'b']:
                    harmonics_key = f'harmonics_{ch}'
                    harmonics = synth_state.get(harmonics_key, [])
                    for h in harmonics:
                        synth.set_harmonics(ch, h)
            except Exception as e:
                logger.warning(f"Synth {i} failed to set state: {e}")

    @staticmethod
    def reconnect_synths(state_manager, existing_synths=None):
        """Reconnect synthesizers after USB disruptions while preserving phase assignment."""
        expected_count = SystemInitializer._expected_synth_count(state_manager)
        endpoints = SynthDiscovery.find_all_synth_endpoints()
        if len(endpoints) != expected_count:
            raise Exception(
                f"Expected {expected_count} synthesizers, discovered {len(endpoints)}. "
                "Waiting for all synths before reconnect."
            )

        # Only close current handles once we know all expected synth endpoints are present.
        if existing_synths:
            SystemInitializer._close_synths(existing_synths)

        ordered_endpoints = SystemInitializer._order_endpoints(endpoints, state_manager)
        synths, connected_endpoints = SystemInitializer._connect_synths(ordered_endpoints)
        if len(synths) != expected_count:
            raise Exception(
                f"Expected {expected_count} synthesizers after reconnect, connected {len(synths)}"
            )

        SystemInitializer._sync_synths_to_state(synths, state_manager)
        state_manager.synth_device_map = [ep.get('device_key') for ep in connected_endpoints]
        state_manager.num_synths = len(synths)
        state_manager.save_state()
        return synths, connected_endpoints

    @staticmethod
    def initialize_system(state_manager):
        # The full code of initialize_system from main.py, with references to globals replaced by arguments.

        init_start_time = time.time()
        logger.info("=" * 60)
        logger.info(" NHP_Synth Initialization ".center(60))
        logger.info("=" * 60)
        logger.info("[Step 1/4] Connecting to I2C rotary encoders...")

        encoder_configs = [
            {'addr': 0x36, 'name': 'Voltage', 'function': 'voltage'},
            {'addr': 0x37, 'name': 'Current', 'function': 'current'},
            {'addr': 0x38, 'name': 'Frequency', 'function': 'frequency'},
            {'addr': 0x39, 'name': 'Phase', 'function': 'phase'},
            {'addr': 0x3a, 'name': 'Harmonics', 'function': 'harmonics'}
        ]

        encoder_init_errors = []
        try:
            i2c = busio.I2C(board.SCL, board.SDA)
            logger.info("Scanning I2C bus for devices...")
            available_addresses = set()
            try:
                i2c.try_lock()
                available_addresses = set(i2c.scan())
                i2c.unlock()
                if available_addresses:
                    addr_list = [f"0x{addr:02x}" for addr in sorted(available_addresses)]
                    logger.info(f"Found I2C devices: {', '.join(addr_list)}")
                else:
                    logger.warning("No I2C devices found")
            except Exception as e:
                logger.warning(f"I2C scan failed: {e}, proceeding with individual checks")

            encoders = {}
            buttons = {}
            pixels = {}
            present_configs = [config for config in encoder_configs 
                              if not available_addresses or config['addr'] in available_addresses]
            def init_single_encoder(config, i2c, available_addresses):
                addr = config['addr']
                name = config['name']
                function = config['function']
                if available_addresses and addr not in available_addresses:
                    return function, None, None, None, f"No device at 0x{addr:02x} ({name}) - skipping"
                seesaw = None
                for attempt in range(1 if available_addresses else 2):
                    try:
                        if attempt > 0:
                            time.sleep(0.1)
                        seesaw = Seesaw(i2c, addr=addr)
                        break
                    except Exception as e:
                        if attempt == 0 and not available_addresses:
                            time.sleep(0.1)
                        continue
                if seesaw is None:
                    encoder_init_errors.append(f"{name} at 0x{addr:02x} failed to initialize (no seesaw)")
                    return function, None, None, None, f"{name} at 0x{addr:02x} failed"
                encoder = None
                button = None
                pixel = None
                components = []
                # Encoder health check
                try:
                    encoder = IncrementalEncoder(seesaw)
                    pos = encoder.position
                    components.append("encoder")
                except Exception as e:
                    encoder_init_errors.append(f"{name} encoder error: {e}")
                # Button health check
                try:
                    seesaw.pin_mode(24, seesaw.INPUT_PULLUP)
                    button = digitalio.DigitalIO(seesaw, 24)
                    val = button.value
                    components.append("button")
                except Exception as e:
                    encoder_init_errors.append(f"{name} button error: {e}")
                # Pixel/LED test
                try:
                    pixel = neopixel.NeoPixel(seesaw, 6, 1)
                    pixel.brightness = 0.5
                    pixel.fill((255,255,255))  # Test: set to white
                    time.sleep(0.05)
                    pixel.fill((0,0,0))        # Turn off
                    components.append("LED")
                except Exception as e:
                    encoder_init_errors.append(f"{name} LED error: {e}")
                status = f"{name}: {', '.join(components) if components else 'no components'}"
                return function, encoder, button, pixel, status

            if len(present_configs) > 1:
                logger.info(f"Initializing {len(present_configs)} encoders concurrently...")
                with ThreadPoolExecutor(max_workers=5) as executor:
                    future_to_config = {
                        executor.submit(init_single_encoder, config, i2c, available_addresses): config 
                        for config in present_configs
                    }
                    for future in as_completed(future_to_config):
                        function, encoder, button, pixel, status = future.result()
                        encoders[function] = encoder
                        buttons[function] = button
                        pixels[function] = pixel
                        logger.info(f"✓ {status}")
                missing_count = 0
                for config in encoder_configs:
                    if config not in present_configs:
                        func = config['function']
                        encoders[func] = None
                        buttons[func] = None
                        pixels[func] = None
                        missing_count += 1
                if missing_count > 0:
                    logger.warning(f"- {missing_count} encoder(s) not found")
            else:
                logger.info("Initializing encoders sequentially...")
                for config in encoder_configs:
                    function, encoder, button, pixel, status = init_single_encoder(config, i2c, available_addresses)
                    encoders[function] = encoder
                    buttons[function] = button
                    pixels[function] = pixel
                    if encoder is not None or "skipping" in status:
                        logger.info(f"✓ {status}")
                    else:
                        logger.error(f"✗ {status}")
            logger.info("✓ Encoders initialized")
            if encoder_init_errors:
                logger.warning("Encoder/Peripheral issues:")
                for err in encoder_init_errors:
                    logger.warning(f"  {err}")
            step1_end_time = time.time()
            step1_duration = step1_end_time - init_start_time
            logger.info(f"[Step 1/4] Done in {step1_duration:.2f}s")
        except Exception as e:
            logger.error(f"✗ Failed to connect to rotary encoder: {e}")
            logger.warning("Make sure the I2C rotary encoder is connected and powered")
            raise
    
        for i in range(120):
            color = tuple(int(c * 255) for c in colorsys.hsv_to_rgb(3*i/360, 1.0, 1.0))
            for pixel in pixels.values():
                if pixel:
                    pixel.fill(color)
                    if i == 120:
                        pixel.fill((255, 255, 255))

        step2_start_time = time.time()
        logger.info("[Step 2/4] Connecting to synthesizer...")
        try:
            expected_count = SystemInitializer._expected_synth_count(state_manager)
            endpoints = SynthDiscovery.find_all_synth_endpoints()
            if len(endpoints) != expected_count:
                raise Exception(
                    f"Expected {expected_count} synthesizers, discovered {len(endpoints)}. "
                    "Aborting initialization."
                )

            ordered_endpoints = SystemInitializer._order_endpoints(endpoints, state_manager)
            logger.info(f"Found {len(ordered_endpoints)} synthesizer(s)")

            synths, connected_endpoints = SystemInitializer._connect_synths(ordered_endpoints)
            if len(synths) != expected_count:
                raise Exception(
                    f"Expected {expected_count} synthesizers, connected {len(synths)}. "
                    "Aborting initialization."
                )

            state_manager.synth_device_map = [ep.get('device_key') for ep in connected_endpoints]
            device_paths = [ep.get('path') for ep in connected_endpoints]

            step2_end_time = time.time()
            step2_duration = step2_end_time - step2_start_time
            logger.info(f"[Step 2/4] Done in {step2_duration:.2f}s")

            step3_start_time = time.time()
            logger.info("[Step 3/4] Syncing synths to state_manager...")
            SystemInitializer._sync_synths_to_state(synths, state_manager)

            step3_end_time = time.time()
            step3_duration = step3_end_time - step3_start_time
            logger.info(f"[Step 3/4] Done in {step3_duration:.2f}s")

            step4_start_time = time.time()
            logger.info("[Step 4/4] Initializing control system...")
            num_synths = len(synths)
            led_colors = {
                'voltage': (255, 0, 0),
                'current': (255, 165, 0),
                'frequency': (0, 255, 0),
                'phase': (0, 0, 255),
                'harmonics': (255, 0, 255)
            }

            for func, pixel in pixels.items():
                if pixel and func in led_colors:
                    try:
                        pixel.fill(led_colors[func])
                    except:
                        pass

            step4_end_time = time.time()
            step4_duration = step4_end_time - step4_start_time
            total_init_time = step4_end_time - init_start_time
            logger.info(f"[Step 4/4] Done in {step4_duration:.2f}s")
            logger.info(f"✓ Initialization complete in {total_init_time:.2f}s.")
            logger.info("-" * 60)
            return {
                'encoders': encoders,
                'buttons': buttons,
                'pixels': pixels,
                'synths': synths,
                'device_paths': device_paths,
                'led_colors': led_colors,
                'num_synths': num_synths
            }
        except Exception as e:
            if 'synths' in locals():
                SystemInitializer._close_synths(synths)
            raise
