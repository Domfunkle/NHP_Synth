
import glob
import os
import logging
logger = logging.getLogger("NHP_Synth")

class SynthDiscovery:
    """
    Utility class for discovering synthesizer USB devices.
    """
    @staticmethod
    def _build_by_id_lookup():
        """Map resolved serial device path -> stable /dev/serial/by-id symlink name."""
        lookup = {}
        for by_id_path in glob.glob('/dev/serial/by-id/*'):
            try:
                resolved = os.path.realpath(by_id_path)
                if resolved:
                    lookup[resolved] = os.path.basename(by_id_path)
            except Exception:
                continue
        return lookup

    @staticmethod
    def find_all_synth_endpoints():
        """Find synthesizers and return endpoint metadata keyed by physical USB path."""
        from synth_control import SynthInterface  # Delayed import to avoid circular import

        synth_endpoints = []
        path_devices = glob.glob('/dev/serial/by-path/*')

        usb_devices = []
        priority_keywords = ['usb', 'esp', 'arduino', 'ch34', 'cp210', 'ftdi']
        for device in path_devices:
            device_lower = device.lower()
            if any(keyword in device_lower for keyword in priority_keywords):
                usb_devices.append(device)

        if not usb_devices:
            usb_devices = [d for d in path_devices if 'usb' in d.lower()]
        if not usb_devices:
            usb_devices = path_devices

        by_id_lookup = SynthDiscovery._build_by_id_lookup()

        logger.info(f"Scanning {len(usb_devices)} potential devices...")
        for i, device in enumerate(usb_devices):
            try:
                device_name = device.split('/')[-1]
                logger.info(f"[{i+1}/{len(usb_devices)}] Trying: {device_name}")
                with SynthInterface(device) as synth:
                    resolved = os.path.realpath(device)
                    by_id_name = by_id_lookup.get(resolved)
                    # Phase mapping is intentionally tied to fixed Raspberry Pi USB topology.
                    # Keep identity based on by-path so each physical Pi USB port is a stable slot.
                    device_key = f"by-path:{device_name}"

                    synth_endpoints.append({
                        'path': device,
                        'resolved_path': resolved,
                        'device_key': device_key,
                        'by_id_name': by_id_name,
                    })
                    logger.info(f"✓ Found synthesizer ({device_key})")
            except Exception:
                continue

        if not synth_endpoints:
            logger.error("✗ No synthesizers found. Tried devices:")
            for device in usb_devices:
                logger.error(f"- {device.split('/')[-1]}")
            raise Exception("No synthesizers found on any USB port")

        return synth_endpoints

    @staticmethod
    def find_all_synth_devices():
        """Backward-compatible list of synth device paths."""
        return [endpoint['path'] for endpoint in SynthDiscovery.find_all_synth_endpoints()]
