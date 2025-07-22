#!/usr/bin/env python3
"""
UART Test Utility

Test UART communication with ESP32 devices and verify command responses.
"""

import serial
import time
import sys
from typing import List


def test_uart_device(port: str, baudrate: int = 115200) -> bool:
    """Test UART communication with a single device"""
    try:
        print(f"Testing {port}...")
        with serial.Serial(port, baudrate, timeout=2) as ser:
            # Send help command
            ser.write(b"help\r")
            time.sleep(0.5)
            
            # Read response
            response = ser.read_all().decode('utf-8', errors='ignore')
            
            if "Commands:" in response:
                print(f"✓ {port} - Device responding correctly")
                return True
            else:
                print(f"✗ {port} - Unexpected response: {response[:100]}...")
                return False
                
    except Exception as e:
        print(f"✗ {port} - Error: {e}")
        return False


def scan_devices(ports: List[str]) -> List[str]:
    """Scan multiple ports for responsive devices"""
    responsive_devices = []
    
    for port in ports:
        if test_uart_device(port):
            responsive_devices.append(port)
            
    return responsive_devices


def interactive_test(port: str):
    """Interactive UART session"""
    print(f"Starting interactive session with {port}")
    print("Type commands (or 'quit' to exit):")
    
    try:
        with serial.Serial(port, 115200, timeout=1) as ser:
            while True:
                command = input("> ").strip()
                if command.lower() == 'quit':
                    break
                    
                ser.write(f"{command}\r".encode())
                time.sleep(0.1)
                
                # Read any response
                if ser.in_waiting:
                    response = ser.read_all().decode('utf-8', errors='ignore')
                    if response:
                        print(response)
                        
    except KeyboardInterrupt:
        print("\nSession ended.")
    except Exception as e:
        print(f"Error: {e}")


def main():
    if len(sys.argv) > 1:
        if sys.argv[1] == "scan":
            # Scan common ports
            common_ports = [f"/dev/ttyUSB{i}" for i in range(4)]
            print("Scanning for NHP_Synth devices...")
            devices = scan_devices(common_ports)
            
            if devices:
                print(f"\nFound {len(devices)} responsive device(s):")
                for device in devices:
                    print(f"  - {device}")
            else:
                print("\nNo responsive devices found.")
                
        elif sys.argv[1] == "interactive":
            port = sys.argv[2] if len(sys.argv) > 2 else "/dev/ttyUSB0"
            interactive_test(port)
        else:
            print("Usage:")
            print("  python uart_test.py scan")
            print("  python uart_test.py interactive [port]")
    else:
        # Test default device
        test_uart_device("/dev/ttyUSB0")


if __name__ == "__main__":
    main()
