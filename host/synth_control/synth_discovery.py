
import glob
import logging
logger = logging.getLogger("NHP_Synth")

class SynthDiscovery:
    """
    Utility class for discovering synthesizer USB devices.
    """
    @staticmethod
    def find_all_synth_devices():
        """Find all synthesizer USB devices automatically using by-path."""
        from synth_control import SynthInterface  # Delayed import to avoid circular import
        synth_devices = []
        # First try by-path devices (more reliable)
        path_devices = glob.glob('/dev/serial/by-path/*')
        # Filter for likely USB serial devices to reduce scan time
        usb_devices = []
        priority_keywords = ['usb', 'esp', 'arduino', 'ch34', 'cp210', 'ftdi']
        # First pass: prioritize devices with known keywords
        for device in path_devices:
            device_lower = device.lower()
            if any(keyword in device_lower for keyword in priority_keywords):
                usb_devices.append(device)
        # Second pass: add remaining USB devices if needed
        if not usb_devices:
            usb_devices = [d for d in path_devices if 'usb' in d.lower()]
        # Fall back to all devices if nothing found
        if not usb_devices:
            usb_devices = path_devices
        logger.info(f"Scanning {len(usb_devices)} potential devices...")
        # Quick scan - try devices in order, but stop at first success for speed
        for i, device in enumerate(usb_devices):
            try:
                device_name = device.split('/')[-1]  # Get just the filename for cleaner output
                logger.info(f"[{i+1}/{len(usb_devices)}] Trying: {device_name}")
                # Quick test to see if it responds
                with SynthInterface(device) as synth:
                    synth_devices.append(device)
                    logger.info("✓ Found synthesizer")
                    # Continue scanning for multiple devices rather than stopping
            except Exception as e:
                # Don't print every failure to reduce console spam
                continue
        if not synth_devices:
            logger.error("✗ No synthesizers found. Tried devices:")
            for device in usb_devices:
                logger.error(f"- {device.split('/')[-1]}")
            raise Exception("No synthesizers found on any USB port")
        return synth_devices
