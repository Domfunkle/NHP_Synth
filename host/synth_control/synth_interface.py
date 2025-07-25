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
    
    def __init__(self, port: str = '/dev/ttyUSB0', baudrate: int = 115200):
        """
        Initialize UART connection to synthesizer
        
        Args:
            port: Serial port (e.g., '/dev/ttyUSB0', 'COM3')
            baudrate: UART baud rate (default: 115200)
        """
        self.port = port
        self.baudrate = baudrate
        self.ser: Optional[serial.Serial] = None
        
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
            self.ser.write(f"{command}\r".encode())
            return True
        except Exception as e:
            logger.error(f"Failed to send command: {e}")
            return False
            
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
