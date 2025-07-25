import time
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
import board
import busio
from adafruit_seesaw.seesaw import Seesaw
from adafruit_seesaw.rotaryio import IncrementalEncoder
from adafruit_seesaw import digitalio, neopixel
from .synth_interface import SynthInterface
from .synth_state import SynthStateManager
from .synth_discovery import SynthDiscovery
import logging
logger = logging.getLogger("NHP_Synth")

class SystemInitializer:
    """
    Handles full system initialization for NHP_Synth.
    """
    @staticmethod
    def initialize_system(get_default_for_synth, save_synth_state, load_synth_state, STATE_FILE):
        # The full code of initialize_system from main.py, with references to globals replaced by arguments.

        init_start_time = time.time()
        logger.info("=" * 60)
        logger.info(" NHP_Synth Initialization ".center(60))
        logger.info("=" * 60)
        logger.info("[Step 1/3] Connecting to I2C rotary encoders...")

        encoder_configs = [
            {'addr': 0x36, 'name': 'Amplitude A', 'function': 'amplitude_a'},
            {'addr': 0x37, 'name': 'Amplitude B', 'function': 'amplitude_b'},
            {'addr': 0x38, 'name': 'Frequency', 'function': 'frequency'},
            {'addr': 0x39, 'name': 'Phase', 'function': 'phase'},
            {'addr': 0x3a, 'name': 'Harmonics', 'function': 'harmonics'}
        ]

        class DummyButton:
            @property
            def value(self):
                return True

        class DummyPixel:
            def fill(self, color):
                pass
            @property
            def brightness(self):
                return 0.5
            @brightness.setter
            def brightness(self, value):
                pass

        dummy_button = DummyButton()
        dummy_pixel = DummyPixel()

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
                    except:
                        if attempt == 0 and not available_addresses:
                            time.sleep(0.1)
                        continue
                if seesaw is None:
                    return function, None, None, None, f"{name} at 0x{addr:02x} failed"
                encoder = None
                button = None
                pixel = None
                components = []
                try:
                    encoder = IncrementalEncoder(seesaw)
                    encoder.position
                    components.append("encoder")
                except:
                    pass
                try:
                    seesaw.pin_mode(24, seesaw.INPUT_PULLUP)
                    button = digitalio.DigitalIO(seesaw, 24)
                    components.append("button")
                except:
                    pass
                try:
                    pixel = neopixel.NeoPixel(seesaw, 6, 1)
                    pixel.brightness = 0.5
                    components.append("LED")
                except:
                    pass
                status = f"{name}: {', '.join(components) if components else 'no components'}"
                return function, encoder, button, pixel, status

            if len(present_configs) > 1:
                logger.info(f"Initializing {len(present_configs)} encoders concurrently...")
                with ThreadPoolExecutor(max_workers=3) as executor:
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
            for func in ['amplitude_a', 'amplitude_b', 'frequency', 'phase', 'harmonics']:
                if buttons[func] is None:
                    buttons[func] = dummy_button
                if pixels[func] is None:
                    pixels[func] = dummy_pixel
            logger.info("✓ Encoders initialized")
            step1_end_time = time.time()
            step1_duration = step1_end_time - init_start_time
            logger.info(f"[Step 1/3] Done in {step1_duration:.2f}s")
        except Exception as e:
            logger.error(f"✗ Failed to connect to rotary encoder: {e}")
            logger.warning("Make sure the I2C rotary encoder is connected and powered")
            raise

        step2_start_time = time.time()
        logger.info("[Step 2/3] Connecting to synthesizer...")
        try:
            device_paths = SynthDiscovery.find_all_synth_devices()
            logger.info(f"Found {len(device_paths)} synthesizer(s)")
            synths = []
            for i, device_path in enumerate(device_paths):
                try:
                    synth = SynthInterface(device_path)
                    synth.__enter__()
                    synths.append(synth)
                    device_name = device_path.split('/')[-1]
                    logger.info(f"✓ Synth {i+1}: {device_name}")
                except Exception as e:
                    device_name = device_path.split('/')[-1]
                    logger.error(f"✗ Failed to connect to {device_name}: {e}")
            if not synths:
                raise Exception("No synthesizers could be connected")
            step2_end_time = time.time()
            step2_duration = step2_end_time - step2_start_time
            logger.info(f"[Step 2/3] Done in {step2_duration:.2f}s")
            step3_start_time = time.time()
            logger.info("[Step 3/3] Initializing control system...")
            num_synths = len(synths)
            if not os.path.exists(STATE_FILE):
                amplitude_a = [get_default_for_synth(i, 'amplitude_a') for i in range(num_synths)]
                amplitude_b = [get_default_for_synth(i, 'amplitude_b') for i in range(num_synths)]
                frequency_a = [get_default_for_synth(i, 'frequency_a') for i in range(num_synths)]
                frequency_b = [get_default_for_synth(i, 'frequency_b') for i in range(num_synths)]
                phase_a = [get_default_for_synth(i, 'phase_a') for i in range(num_synths)]
                phase_b = [get_default_for_synth(i, 'phase_b') for i in range(num_synths)]
                harmonics_a = [[] for _ in range(num_synths)]
                harmonics_b = [[] for _ in range(num_synths)]
                save_synth_state(num_synths, amplitude_a, amplitude_b, frequency_a, frequency_b, phase_a, phase_b, harmonics_a, harmonics_b)
            state = load_synth_state()
            if state and state.get('num_synths', num_synths) == num_synths and isinstance(state.get('synths'), list):
                synth_states = state['synths']
                amplitude_a = [s.get('amplitude_a', get_default_for_synth(i, 'amplitude_a')) for i, s in enumerate(synth_states)]
                amplitude_b = [s.get('amplitude_b', get_default_for_synth(i, 'amplitude_b')) for i, s in enumerate(synth_states)]
                frequency_a = [s.get('frequency_a', get_default_for_synth(i, 'frequency_a')) for i, s in enumerate(synth_states)]
                frequency_b = [s.get('frequency_b', get_default_for_synth(i, 'frequency_b')) for i, s in enumerate(synth_states)]
                phase_a = [s.get('phase_a', get_default_for_synth(i, 'phase_a')) for i, s in enumerate(synth_states)]
                phase_b = [s.get('phase_b', get_default_for_synth(i, 'phase_b')) for i, s in enumerate(synth_states)]
                harmonics_a = [s.get('harmonics_a', []) for s in synth_states]
                harmonics_b = [s.get('harmonics_b', []) for s in synth_states]
                logger.info(f"Loaded synth state from {STATE_FILE}")
            else:
                amplitude_a = [get_default_for_synth(i, 'amplitude_a') for i in range(num_synths)]
                amplitude_b = [get_default_for_synth(i, 'amplitude_b') for i in range(num_synths)]
                frequency_a = [get_default_for_synth(i, 'frequency_a') for i in range(num_synths)]
                frequency_b = [get_default_for_synth(i, 'frequency_b') for i in range(num_synths)]
                harmonics_a = [[] for _ in range(num_synths)]
                harmonics_b = [[] for _ in range(num_synths)]
                if num_synths == 3:
                    phase_a = [0, 120, -120]
                    phase_b = [0, 120, -120]
                else:
                    phase_a = [get_default_for_synth(i, 'phase_a') for i in range(num_synths)]
                    phase_b = [get_default_for_synth(i, 'phase_b') for i in range(num_synths)]
            selection_timeout = 60.0
            selection_mode = {
                'amplitude_a': 'all',
                'amplitude_b': 'all',
                'frequency': 'all',
                'phase': 'all',
                'harmonics': 'all'
            }
            selection_time = {
                'amplitude_a': 0,
                'amplitude_b': 0,
                'frequency': 0,
                'phase': 0,
                'harmonics': 0
            }
            active_synth = {
                'amplitude_a': 0,
                'amplitude_b': 0,
                'frequency': 0,
                'phase': 0,
                'harmonics': 0
            }
            active_channel = {
                'phase': 'a',
                'harmonics': 'a'
            }
            last_positions = {}
            for func in ['amplitude_a', 'amplitude_b', 'frequency', 'phase', 'harmonics']:
                if encoders[func]:
                    last_positions[func] = encoders[func].position
                else:
                    last_positions[func] = 0
            logger.info("Setting initial values on synthesizers...")
            for i, synth in enumerate(synths):
                try:
                    amp_a = round(float(amplitude_a[i]), 2)
                    amp_b = round(float(amplitude_b[i]), 2)
                    freq_a = round(float(frequency_a[i]), 2)
                    freq_b = round(float(frequency_b[i]), 2)
                    ph_a = round(float(phase_a[i]), 2)
                    ph_b = round(float(phase_b[i]), 2)
                    synth.set_amplitude('a', amp_a)
                    synth.set_amplitude('b', amp_b)
                    synth.set_frequency('a', freq_a)
                    synth.set_frequency('b', freq_b)
                    synth.set_phase('a', ph_a)
                    synth.set_phase('b', ph_b)
                except Exception as e:
                    logger.warning(f"Synth {i + 1} warning: {e}")
            led_colors = {
                'amplitude_a': (255, 0, 0),
                'amplitude_b': (255, 165, 0),
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
            step3_end_time = time.time()
            step3_duration = step3_end_time - step3_start_time
            total_init_time = step3_end_time - init_start_time
            logger.info(f"[Step 3/3] Done in {step3_duration:.2f}s")
            logger.info(f"✓ Initialization complete in {total_init_time:.2f}s.")
            logger.info("-" * 60)
            return {
                'encoders': encoders,
                'buttons': buttons,
                'pixels': pixels,
                'synths': synths,
                'device_paths': device_paths,
                'dummy_button': dummy_button,
                'dummy_pixel': dummy_pixel,
                'led_colors': led_colors,
                'amplitude_a': amplitude_a,
                'amplitude_b': amplitude_b,
                'frequency_a': frequency_a,
                'frequency_b': frequency_b,
                'phase_a': phase_a,
                'phase_b': phase_b,
                'harmonics_a': harmonics_a,
                'harmonics_b': harmonics_b,
                'active_synth': active_synth,
                'active_channel': active_channel,
                'last_positions': last_positions,
                'num_synths': num_synths,
                'selection_mode': selection_mode,
                'selection_time': selection_time,
                'selection_timeout': selection_timeout
            }
        except Exception as e:
            for synth in synths:
                try:
                    synth.__exit__(None, None, None)
                except:
                    pass
            raise
