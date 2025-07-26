"""
UART Interface for NHP_Synth ESP32 DDS Synthesizer

Provides a Python interface to control the ESP32 synthesizer via UART commands.
"""

import serial
import time
from typing import Optional, Union
import logging
logger = logging.getLogger("NHP_Synth")

class SynthInterface:
    """Interface to control NHP_Synth via UART"""
    
    def __init__(self, port: str = '/dev/ttyUSB0', id: int = 0, baudrate: int = 115200):
        """
        Initialize UART connection to synthesizer
        
        Args:
            port: Serial port (e.g., '/dev/ttyUSB0', 'COM3')
            baudrate: UART baud rate (default: 115200)
        """
        self.port = port
        self.baudrate = baudrate
        self.ser: Optional[serial.Serial] = None
        self.id = id
        
    def connect(self) -> bool:
        """
        Connect to the synthesizer
        
        Returns:
            True if connection successful, False otherwise
        """
        try:
            self.ser = serial.Serial(self.port, self.baudrate, timeout=1)
            time.sleep(0.1)  # Allow time for connection
            return True
        except Exception as e:
            logger.error(f"Failed to connect: {e}")
            return False
            
    def disconnect(self):
        """Disconnect from synthesizer"""
        if self.ser and self.ser.is_open:
            self.ser.close()
            
    def send_command(self, command: str) -> bool:
        """
        Send command to synthesizer
        
        Args:
            command: Command string (without \\r terminator)
            
        Returns:
            True if command sent successfully
        """
        if not self.ser or not self.ser.is_open:
            logger.error("Not connected to synthesizer")
            return False

        try:
            logger.debug(f"Synth # {self.id} sent cmd: {command}")
            self.ser.write(f"{command}\r".encode())
            return True
        except Exception as e:
            logger.error(f"Failed to send command: {e}")
            return False

    def get_frequency(self, channel: str) -> Union[float, None]:
        """
        Get frequency for a channel
        
        Args:
            channel: 'a' or 'b'
            
        Returns:
            response "rf<channel><frequency>" as float, or None if error
            example: "rfb1000.0" -> 1000.0
        """
        if channel.lower() not in ['a', 'b']:
            raise ValueError("Channel must be 'a' or 'b'")
        
        self.send_command(f"rf{channel.lower()}")
        response = self.ser.readline().decode().strip()
        logger.debug(f"Synth # {self.id} rcvd res: {response}")
        
        try:
            return float(response.split(f"rf{channel.lower()}")[-1])
        except (ValueError, IndexError):
            logger.error(f"Synth # {self.id} invalid frequency response: {response}")
            return None

    def set_frequency(self, channel: str, frequency: float) -> bool:
        """
        Set frequency for a channel
        
        Args:
            channel: 'a' or 'b'
            frequency: Frequency in Hz (20-8000)
            
        Returns:
            True if command sent successfully
        """
        if channel.lower() not in ['a', 'b']:
            raise ValueError("Channel must be 'a' or 'b'")
        if not (20 <= frequency <= 8000):
            raise ValueError("Frequency must be between 20 and 8000 Hz")
            
        return self.send_command(f"wf{channel.lower()}{frequency}")

    def get_amplitude(self, channel: str) -> Union[float, None]:
        """
        Get amplitude for a channel
        
        Args:
            channel: 'a' or 'b'
            
        Returns:
            response "wa<channel><amplitude>" as float, or None if error
            example: "waa50.0" -> 50.0
        """
        if channel.lower() not in ['a', 'b']:
            raise ValueError("Channel must be 'a' or 'b'")
        
        self.send_command(f"ra{channel.lower()}")
        response = self.ser.readline().decode().strip()
        logger.debug(f"Synth # {self.id} rcvd res: {response}")
        
        try:
            return float(response.split(f"ra{channel.lower()}")[-1])
        except (ValueError, IndexError):
            logger.error(f"Synth # {self.id} invalid amplitude response: {response}")
            return None

    def set_amplitude(self, channel: str, amplitude: float) -> bool:
        """
        Set amplitude for a channel
        
        Args:
            channel: 'a' or 'b'
            amplitude: Amplitude 0-100%
            
        Returns:
            True if command sent successfully
        """
        if channel.lower() not in ['a', 'b']:
            raise ValueError("Channel must be 'a' or 'b'")
        if not (0 <= amplitude <= 100):
            raise ValueError("Amplitude must be between 0 and 100")
            
        return self.send_command(f"wa{channel.lower()}{amplitude}")

    def get_phase(self, channel: str) -> Union[float, None]:
        """
        Get phase for a channel
        
        Args:
            channel: 'a' or 'b'
            
        Returns:
            response "wp<channel><phase>" as float, or None if error
            example: "wpa180.0" -> 180.0
        """
        if channel.lower() not in ['a', 'b']:
            raise ValueError("Channel must be 'a' or 'b'")
        
        self.send_command(f"rp{channel.lower()}")
        response = self.ser.readline().decode().strip()
        logger.debug(f"Synth # {self.id} rcvd phase res: {response}")

        try:
            return float(response.split(f"rp{channel.lower()}")[-1])
        except (ValueError, IndexError):
            logger.error(f"Synth # {self.id} invalid phase response: {response}")
            return None

    def set_phase(self, channel: str, phase: float) -> bool:
        """
        Set phase for a channel
        
        Args:
            channel: 'a' or 'b'
            phase: Phase in degrees (-360 to +360)
        Returns:
            True if command sent successfully
        """
        if channel.lower() not in ['a', 'b']:
            raise ValueError("Channel must be 'a' or 'b'")
        if not (-360 <= phase <= 360):
            raise ValueError("Phase must be between -360 and +360 degrees")
        return self.send_command(f"wp{channel.lower()}{phase}")

    def get_harmonics(self, channel: str) -> Union[list, None]:
        """
        Get harmonics for a channel

        Args:
            channel: 'a' or 'b'

        Returns:
            List of dicts for each harmonic:
            [
                {"order": 3, "amplitude": 10.0, "phase": 0.0},
                {"order": 5, "amplitude": 20.0, "phase": -90.0}
            ]
            or None if error
        """
        if channel.lower() not in ['a', 'b']:
            raise ValueError("Channel must be 'a' or 'b'")

        self.send_command(f"rh{channel.lower()}")
        response = self.ser.readline().decode().strip()
        logger.debug(f"Synth # {self.id} rcvd harmonics res: {response}")

        harmonics = []
        try:
            prefix = f"rh{channel.lower()}"
            if response.startswith(prefix):
                response = response[len(prefix):]
            # Remove trailing ';' if present
            response = response.rstrip(';')
            if not response:
                return []
            for harmonic in response.split(';'):
                if harmonic:
                    parts = harmonic.split(',')
                    order = int(parts[0])
                    amplitude = float(parts[1])
                    phase = float(parts[2]) if len(parts) > 2 else 0.0
                    harmonics.append({
                        "order": order,
                        "amplitude": amplitude,
                        "phase": phase
                    })
            return harmonics
        except (ValueError, IndexError):
            logger.error(f"Synth # {self.id} invalid harmonics response: {response}")
            return None

    def add_harmonic(self, channel: str, order: int, percent: float, phase: float = 0) -> bool:
        """
        Add harmonic to a channel
        
        Args:
            channel: 'a' or 'b'
            order: Harmonic order (odd numbers >= 3)
            percent: Harmonic amplitude 0-100%
            phase: Harmonic phase in degrees (default: 0, allowed: -360 to +360)
        Returns:
            True if command sent successfully
        """
        if channel.lower() not in ['a', 'b']:
            raise ValueError("Channel must be 'a' or 'b'")
        if order < 3 or order % 2 == 0:
            raise ValueError("Harmonic order must be odd and >= 3")
        if not (0 <= percent <= 100):
            raise ValueError("Harmonic percent must be between 0 and 100")
        if not (-360 <= phase <= 360):
            raise ValueError("Harmonic phase must be between -360 and +360 degrees")
        if phase != 0:
            return self.send_command(f"wh{channel.lower()}{order},{percent},{phase}")
        else:
            return self.send_command(f"wh{channel.lower()}{order},{percent}")
            
    def clear_harmonics(self, channel: str) -> bool:
        """
        Clear all harmonics for a channel
        
        Args:
            channel: 'a' or 'b'
            
        Returns:
            True if command sent successfully
        """
        if channel.lower() not in ['a', 'b']:
            raise ValueError("Channel must be 'a' or 'b'")
            
        return self.send_command(f"whcl{channel.lower()}")
        
    def __enter__(self):
        """Context manager entry"""
        self.connect()
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.disconnect()
